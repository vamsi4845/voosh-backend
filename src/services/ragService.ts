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
    logger.info(`[RAG] Processing query stream: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`);
    
    if (useCache) {
      logger.info(`[RAG] Checking cache for query...`);
      const cached = await getCachedQueryResult(query);
      if (cached) {
        logger.info(`[RAG] Cache hit! Returning cached result (${cached.answer.length} chars)`);
        
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
      logger.info(`[RAG] Cache miss - proceeding with full RAG pipeline`);
    }
    
    logger.info(`[RAG] Step 1: Generating query embedding via Jina API...`);
    const queryEmbedding = await getEmbedding(query);
    logger.info(`[RAG] Step 1 complete: Embedding generated (${queryEmbedding.length} dimensions)`);
    
    logger.info(`[RAG] Step 2: Searching Qdrant vector store (topK=${topK})...`);
    const retrievedPassages = await searchSimilar(queryEmbedding, topK);
    logger.info(`[RAG] Step 2 complete: Found ${retrievedPassages.length} passages`);
    
    if (retrievedPassages.length === 0) {
      logger.warn(`[RAG] No relevant passages found for query`);
      yield {
        type: 'error',
        message: "I couldn't find relevant information in the news articles to answer your question.",
      };
      return;
    }
    
    logger.info(`[RAG] Step 3: Retrieved ${retrievedPassages.length} passages. Top scores: ${retrievedPassages.slice(0, 3).map(p => p.score.toFixed(3)).join(', ')}`);
    logger.info(`[RAG] Step 4: Generating response via Gemini API (streaming)...`);
    
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
    let chunkCount = 0;
    let streamError: Error | null = null;
    
    try {
      for await (const chunk of generateStreamResponse(query, retrievedPassages)) {
        fullAnswer += chunk;
        chunkCount++;
        yield {
          type: 'chunk',
          text: chunk,
        };
      }
    } catch (error) {
      streamError = error instanceof Error ? error : new Error(String(error));
      logger.error(`[RAG] Error during streaming: ${streamError.message}`);
      
      if (fullAnswer.length > 0) {
        logger.warn(`[RAG] Partial response received (${fullAnswer.length} chars) before error - discarding partial response`);
      }
      
      throw streamError;
    }
    
    if (streamError) {
      throw streamError;
    }
    
    logger.info(`[RAG] Step 4 complete: Generated response (${fullAnswer.length} chars, ${chunkCount} stream chunks)`);
    
    if (useCache) {
      logger.info(`[RAG] Caching query result...`);
      const result: QueryResult = {
        answer: fullAnswer,
        sources,
      };
      await cacheQueryResult(query, result);
      logger.info(`[RAG] Query result cached successfully`);
    }
    
    logger.info(`[RAG] Query processing complete`);
    
    yield {
      type: 'complete',
    };
  } catch (error) {
    logger.error(`[RAG] Failed to process query stream:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while processing your query.';
    yield {
      type: 'error',
      message: errorMessage,
    };
  }
}

