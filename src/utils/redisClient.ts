import { createClient, RedisClientType } from 'redis';
import { config } from '../config/config.js';
import { logger } from './logger.js';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: Array<{
    title?: string;
    url?: string;
    score?: number;
  }>;
}

let redisClient: RedisClientType | null = null;

function parseRedisUrl(url: string): { url: string; socket?: { connectTimeout?: number } } {
  let cleanUrl = url.trim();
  
  if (cleanUrl.includes('redis-cli')) {
    const urlMatch = cleanUrl.match(/redis[s]?:\/\/[^\s]+/);
    if (urlMatch) {
      cleanUrl = urlMatch[0];
    }
  }
  
  const isUpstash = cleanUrl.includes('.upstash.io');
  
  if (isUpstash && cleanUrl.startsWith('redis://')) {
    cleanUrl = cleanUrl.replace('redis://', 'rediss://');
  }
  
  const clientConfig: { url: string; socket?: { connectTimeout?: number } } = {
    url: cleanUrl,
  };
  
  if (isUpstash) {
    clientConfig.socket = {
      connectTimeout: 10000,
    };
  }
  
  return clientConfig;
}

export async function getRedisClient(): Promise<RedisClientType> {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  if (redisClient && !redisClient.isOpen) {
    redisClient = null;
  }

  try {
    const clientConfig = parseRedisUrl(config.redisUrl);
    
    logger.info(`Connecting to Redis: ${clientConfig.url.replace(/:[^:@]+@/, ':****@')}`);
    
    const socketConfig: { 
      connectTimeout?: number;
      reconnectStrategy?: (retries: number) => number | Error;
    } = {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.error('Redis: Max reconnection attempts reached');
          return new Error('Max reconnection attempts reached');
        }
        return Math.min(retries * 100, 3000);
      },
    };
    
    if (clientConfig.socket?.connectTimeout) {
      socketConfig.connectTimeout = clientConfig.socket.connectTimeout;
    }
    
    redisClient = createClient({
      url: clientConfig.url,
      socket: socketConfig,
    }) as RedisClientType;

    redisClient.on('error', (err: Error) => {
      logger.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('Redis Client Connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis Client Ready');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis Client Reconnecting');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    redisClient = null;
    throw error;
  }
}

export async function saveMessage(sessionId: string, message: Message): Promise<boolean> {
  try {
    const client = await getRedisClient();
    const key = `session:${sessionId}:messages`;
    const messageJson = JSON.stringify(message);
    
    await client.lPush(key, messageJson);
    await client.expire(key, config.sessionTtl);
    
    return true;
  } catch (error) {
    logger.error('Failed to save message:', error);
    throw error;
  }
}

export async function getSessionHistory(sessionId: string): Promise<Message[]> {
  try {
    const client = await getRedisClient();
    const key = `session:${sessionId}:messages`;
    const messages = await client.lRange(key, 0, -1);
    
    return messages.map(msg => JSON.parse(msg) as Message).reverse();
  } catch (error) {
    logger.error('Failed to get session history:', error);
    throw error;
  }
}

export async function clearSession(sessionId: string): Promise<boolean> {
  try {
    const client = await getRedisClient();
    const key = `session:${sessionId}:messages`;
    await client.del(key);
    return true;
  } catch (error) {
    logger.error('Failed to clear session:', error);
    throw error;
  }
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
}

