import { getEmbedding } from './embeddingService.js';
import { searchSimilar, RetrievedPassage } from './vectorStore.js';
import { generateResponse, generateStreamResponse } from './geminiService.js';
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

export async function processQuery(query: string, topK = 5): Promise<QueryResult> {
  try {
    logger.info(`Processing query: ${query.substring(0, 50)}...`);
    
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
    
    logger.info('Query processed successfully');
    return {
      answer,
      sources,
    };
  } catch (error) {
    logger.error('Failed to process query:', error);
    throw error;
  }
}

export async function* processQueryStream(query: string, topK = 5): AsyncGenerator<StreamChunk, void, unknown> {
  try {
    logger.info(`Processing query stream: ${query.substring(0, 50)}...`);
    
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
    
    for await (const chunk of generateStreamResponse(query, retrievedPassages)) {
      yield {
        type: 'chunk',
        text: chunk,
      };
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

