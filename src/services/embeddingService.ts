import axios, { AxiosError } from 'axios';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

const JINA_EMBEDDING_API = 'https://api.jina.ai/v1/embeddings';
const EMBEDDING_MODEL = 'jina-embeddings-v2-base-en';
const BATCH_SIZE = 10;
const RETRY_DELAY = 1000;
const MAX_RETRIES = 3;

interface JinaEmbeddingResponse {
  data: Array<{
    embedding: number[];
  }>;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getEmbeddingsWithRetry(texts: string[], retries = 0): Promise<number[][]> {
  try {
    const response = await axios.post<JinaEmbeddingResponse>(
      JINA_EMBEDDING_API,
      {
        model: EMBEDDING_MODEL,
        input: texts,
      },
      {
        headers: {
          'Authorization': `Bearer ${config.jinaApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    if (response.data && response.data.data) {
      return response.data.data.map(item => item.embedding);
    }
    
    throw new Error('Invalid response format from Jina API');
  } catch (error) {
    if (retries < MAX_RETRIES) {
      const delay = RETRY_DELAY * (retries + 1);
      logger.warn(`Jina API request failed, retrying in ${delay}ms... (attempt ${retries + 1}/${MAX_RETRIES})`);
      await sleep(delay);
      return getEmbeddingsWithRetry(texts, retries + 1);
    }
    
    const errorMessage = error instanceof AxiosError ? error.message : 'Unknown error';
    logger.error('Failed to get embeddings after retries:', errorMessage);
    throw error;
  }
}

export async function getEmbedding(text: string): Promise<number[]> {
  try {
    logger.info(`[Embedding] Requesting embedding from Jina API (text length: ${text.length} chars)`);
    const embeddings = await getEmbeddingsWithRetry([text]);
    const embedding = embeddings[0] || [];
    logger.info(`[Embedding] Successfully received embedding (${embedding.length} dimensions)`);
    return embedding;
  } catch (error) {
    logger.error('[Embedding] Failed to get embedding:', error);
    throw error;
  }
}

export async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  try {
    if (!texts || texts.length === 0) {
      return [];
    }

    const allEmbeddings: number[][] = [];
    
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      logger.debug(`Processing embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)}`);
      
      const batchEmbeddings = await getEmbeddingsWithRetry(batch);
      allEmbeddings.push(...batchEmbeddings);
      
      if (i + BATCH_SIZE < texts.length) {
        await sleep(200);
      }
    }
    
    return allEmbeddings;
  } catch (error) {
    logger.error('Failed to get embeddings batch:', error);
    throw error;
  }
}

