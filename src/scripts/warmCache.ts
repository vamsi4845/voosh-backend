import { processQuery } from '../services/ragService.js';
import { getCachedQueryResult } from '../utils/redisClient.js';
import { logger } from '../utils/logger.js';

const popularQueries = [
  'What are the latest technology news?',
  'Tell me about recent business developments',
  'What happened in the stock market today?',
];

async function warmCache() {
  logger.info('Starting cache warming...');
  
  let cachedCount = 0;
  let warmedCount = 0;
  
  for (const query of popularQueries) {
    try {
      const cached = await getCachedQueryResult(query);
      
      if (cached) {
        logger.info(`Query already cached, skipping: ${query.substring(0, 50)}...`);
        cachedCount++;
      } else {
        await processQuery(query);
        logger.info(`Warmed cache for: ${query.substring(0, 50)}...`);
        warmedCount++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      logger.error(`Failed to warm cache for query: ${query}`, error);
    }
  }
  
  logger.info(`Cache warming completed. Cached: ${cachedCount}, Warmed: ${warmedCount}, Total: ${popularQueries.length}`);
}

warmCache().catch(console.error);