import express, { Request, Response } from 'express';
import { getSessionHistory, clearSession } from '../utils/redisClient.js';
import { validateSessionId } from '../utils/sessionManager.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.get('/:sessionId/history', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    if (!validateSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID format' });
    }
    
    const history = await getSessionHistory(sessionId);
    res.json({ sessionId, messages: history });
  } catch (error) {
    logger.error('Failed to get session history:', error);
    res.status(500).json({ error: 'Failed to retrieve session history' });
  }
});

router.delete('/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    if (!validateSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID format' });
    }
    
    await clearSession(sessionId);
    res.json({ success: true, message: 'Session cleared' });
  } catch (error) {
    logger.error('Failed to clear session:', error);
    res.status(500).json({ error: 'Failed to clear session' });
  }
});

export default router;

