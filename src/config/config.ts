import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  port: number;
  geminiApiKey: string | undefined;
  jinaApiKey: string | undefined;
  qdrantUrl: string;
  qdrantApiKey: string | undefined;
  redisUrl: string;
  sessionTtl: number;
  nodeEnv: string;
  corsOrigin: string;
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3001', 10),
  geminiApiKey: process.env.GEMINI_API_KEY,
  jinaApiKey: process.env.JINA_API_KEY,
  qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
  qdrantApiKey: process.env.QDRANT_API_KEY,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  sessionTtl: parseInt(process.env.SESSION_TTL || '86400', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};

if (!config.geminiApiKey) {
  console.warn('Warning: GEMINI_API_KEY not set');
}

if (!config.jinaApiKey) {
  console.warn('Warning: JINA_API_KEY not set');
}

