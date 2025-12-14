import { processQuery } from '../services/ragService.js';
import { logger } from '../utils/logger.js';

const popularQueries = [
  'What are the latest technology news?',
  'Tell me about recent business developments',
  'What happened in the stock market today?',
];

async function warmCache() {
  logger.info('Starting cache warming...');
  
  for (const query of popularQueries) {
    try {
      await processQuery(query);
      logger.info(`Warmed cache for: ${query.substring(0, 50)}...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      logger.error(`Failed to warm cache for query: ${query}`, error);
    }
  }
  
  logger.info('Cache warming completed');
}

warmCache().catch(console.error);