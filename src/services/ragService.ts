import { getEmbedding } from './embeddingService.js';
import { searchSimilar } from './vectorStore.js';
import { generateResponse, generateStreamResponse } from './geminiService.js';
import { getCachedQueryResult, cacheQueryResult } from '../utils/redisClient.js';
import { logger } from '../utils/logger.js';

export interface QueryResult {
  answer: string;
  sources: Array<{
    title?: string;
    url?: string;
    score?: number;
  }>;
}

export interface StreamChunk {
  type: 'sources' | 'chunk' | 'complete' | 'error';
  sources?: Array<{
    title?: string;
    url?: string;
    score?: number;
  }>;
  text?: string;
  message?: string;
}

export async function processQuery(query: string, topK = 5, useCache = true): Promise<QueryResult> {
  try {
    logger.info(`Processing query: ${query.substring(0, 50)}...`);
    
    if (useCache) {
      const cached = await getCachedQueryResult(query);
      if (cached) {
        logger.info('Returning cached query result');
        return cached;
      }
    }
    
    logger.debug('Step 1: Generating query embedding...');
    const queryEmbedding = await getEmbedding(query);
    
    logger.debug('Step 2: Searching vector store...');
    const retrievedPassages = await searchSimilar(queryEmbedding, topK);
    
    if (retrievedPassages.length === 0) {
      logger.warn('No relevant passages found');
      return {
        answer: "I couldn't find relevant information in the news articles to answer your question.",
        sources: [],
      };
    }
    
    logger.debug(`Step 3: Retrieved ${retrievedPassages.length} passages, generating response...`);
    const answer = await generateResponse(query, retrievedPassages);
    
    const sources = retrievedPassages.map(p => ({
      title: p.title,
      url: p.url,
      score: p.score,
    }));
    
    const result: QueryResult = {
      answer,
      sources,
    };
    
    if (useCache) {
      await cacheQueryResult(query, result);
    }
    
    logger.info('Query processed successfully');
    return result;
  } catch (error) {
    logger.error('Failed to process query:', error);
    throw error;
  }
}

export async function* processQueryStream(query: string, topK = 5, useCache = true): AsyncGenerator<StreamChunk, void, unknown> {
  try {
    logger.info(`Processing query stream: ${query.substring(0, 50)}...`);
    
    if (useCache) {
      const cached = await getCachedQueryResult(query);
      if (cached) {
        logger.info('Returning cached query result (streaming)');
        
        yield {
          type: 'sources',
          sources: cached.sources,
        };
        
        const chunkSize = 50;
        const answer = cached.answer;
        for (let i = 0; i < answer.length; i += chunkSize) {
          const chunk = answer.slice(i, i + chunkSize);
          yield {
            type: 'chunk',
            text: chunk,
          };
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        yield {
          type: 'complete',
        };
        return;
      }
    }
    
    logger.debug('Step 1: Generating query embedding...');
    const queryEmbedding = await getEmbedding(query);
    
    logger.debug('Step 2: Searching vector store...');
    const retrievedPassages = await searchSimilar(queryEmbedding, topK);
    
    if (retrievedPassages.length === 0) {
      logger.warn('No relevant passages found');
      yield {
        type: 'error',
        message: "I couldn't find relevant information in the news articles to answer your question.",
      };
      return;
    }
    
    logger.debug(`Step 3: Retrieved ${retrievedPassages.length} passages, streaming response...`);
    
    const sources = retrievedPassages.map(p => ({
      title: p.title,
      url: p.url,
      score: p.score,
    }));
    
    yield {
      type: 'sources',
      sources,
    };
    
    let fullAnswer = '';
    for await (const chunk of generateStreamResponse(query, retrievedPassages)) {
      fullAnswer += chunk;
      yield {
        type: 'chunk',
        text: chunk,
      };
    }
    
    if (useCache) {
      const result: QueryResult = {
        answer: fullAnswer,
        sources,
      };
      await cacheQueryResult(query, result);
    }
    
    yield {
      type: 'complete',
    };
  } catch (error) {
    logger.error('Failed to process query stream:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while processing your query.';
    yield {
      type: 'error',
      message: errorMessage,
    };
  }
}

