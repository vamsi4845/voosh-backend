import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { config } from './config/config.js';
import { logger } from './utils/logger.js';
import { initializeCollection } from './services/vectorStore.js';
import { getRedisClient } from './utils/redisClient.js';
import { processQueryStream } from './services/ragService.js';
import { saveMessage, Message } from './utils/redisClient.js';
import { validateSessionId, generateSessionId } from './utils/sessionManager.js';

import healthRouter from './routes/health.js';
import sessionRouter from './routes/session.js';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));

app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/session', sessionRouter);

interface SocketMessageData {
  sessionId?: string;
  message: string;
}

io.on('connection', (socket: Socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('chat:message', async (data: SocketMessageData) => {
    try {
      let { sessionId, message } = data;
      
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        socket.emit('chat:error', { message: 'Message is required' });
        return;
      }
      
      message = message.trim();
      
      if (!sessionId || !validateSessionId(sessionId)) {
        sessionId = generateSessionId();
        logger.info(`Generated new session ID: ${sessionId}`);
        socket.emit('chat:session', { sessionId });
      }
      
      const userMessage: Message = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      
      await saveMessage(sessionId, userMessage);
      socket.emit('chat:user_message', userMessage);
      
      logger.info(`[Session ${sessionId}] Processing stream query: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);
      
      let fullResponse = '';
      let sources: Array<{ title?: string; url?: string; score?: number }> = [];
      
      for await (const chunk of processQueryStream(message)) {
        if (chunk.type === 'sources') {
          sources = chunk.sources || [];
          logger.info(`[Session ${sessionId}] Retrieved ${sources.length} sources from vector store`);
          socket.emit('chat:sources', { sources });
        } else if (chunk.type === 'chunk') {
          fullResponse += chunk.text || '';
          socket.emit('chat:response', { text: chunk.text });
        } else if (chunk.type === 'error') {
          logger.error(`[Session ${sessionId}] Error: ${chunk.message}`);
          socket.emit('chat:error', { message: chunk.message });
          return;
        } else if (chunk.type === 'complete') {
          logger.info(`[Session ${sessionId}] Processing complete. Response length: ${fullResponse.length} chars`);
          const botMessage: Message = {
            role: 'assistant',
            content: fullResponse,
            sources,
            timestamp: new Date().toISOString(),
          };
          
          await saveMessage(sessionId, botMessage);
          socket.emit('chat:complete', botMessage);
        }
      }
    } catch (error) {
      logger.error('Socket error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while processing your message';
      socket.emit('chat:error', { 
        message: errorMessage,
      });
    }
  });
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

async function startServer(): Promise<void> {
  try {
    logger.info('Initializing services...');
    
    await initializeCollection();
    logger.info('Vector store initialized');
    
    await getRedisClient();
    logger.info('Redis client initialized');
    
    httpServer.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
      logger.info(`CORS enabled for: ${config.corsOrigin}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  httpServer.close();
  process.exit(0);
});

