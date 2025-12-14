import express, { Request, Response } from 'express';
import { getRedisClient } from '../utils/redisClient.js';
import { getCollectionInfo } from '../services/vectorStore.js';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const health: {
      status: string;
      timestamp: string;
      services: Record<string, string>;
    } = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {},
    };
    
    try {
      const redisClient = await getRedisClient();
      await redisClient.ping();
      health.services.redis = 'connected';
    } catch (error) {
      health.services.redis = 'disconnected';
      health.status = 'degraded';
    }
    
    try {
      await getCollectionInfo();
      health.services.qdrant = 'connected';
    } catch (error) {
      health.services.qdrant = 'disconnected';
      health.status = 'degraded';
    }
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(503).json({
      status: 'unhealthy',
      error: errorMessage,
    });
  }
});

export default router;

