import express, { Request, Response } from 'express';
import { processQuery } from '../services/ragService.js';
import { saveMessage, Message } from '../utils/redisClient.js';
import { validateSessionId, generateSessionId } from '../utils/sessionManager.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

interface ChatRequestBody {
  sessionId?: string;
  message: string;
}

router.post('/', async (req: Request<{}, {}, ChatRequestBody>, res: Response): Promise<void> => {
  try {
    let { sessionId, message } = req.body;
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }
    
    message = message.trim();
    
    if (!sessionId || !validateSessionId(sessionId)) {
      sessionId = generateSessionId();
      logger.info(`Generated new session ID: ${sessionId}`);
    }
    
    const userMessage: Message = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    
    await saveMessage(sessionId, userMessage);
    
    logger.info(`Processing message for session ${sessionId}`);
    const result = await processQuery(message);
    
    const botMessage: Message = {
      role: 'assistant',
      content: result.answer,
      sources: result.sources,
      timestamp: new Date().toISOString(),
    };
    
    await saveMessage(sessionId, botMessage);
    
    res.json({
      sessionId,
      response: botMessage,
    });
  } catch (error) {
    logger.error('Failed to process chat message:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ 
      error: 'Failed to process message',
      message: errorMessage,
    });
  }
});

export default router;

