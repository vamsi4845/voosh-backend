import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

const COLLECTION_NAME = 'news_articles';
const EMBEDDING_DIMENSION = 768;

export interface VectorPoint {
  id: string;
  vector: number[];
  text: string;
  articleId: string;
  chunkId: string;
  url: string;
  title: string;
}

export interface RetrievedPassage {
  score: number;
  text: string;
  articleId: string;
  chunkId: string;
  url: string;
  title: string;
}

let qdrantClient: QdrantClient | null = null;

function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    const clientConfig: { url: string; apiKey?: string } = {
      url: config.qdrantUrl,
    };
    
    if (config.qdrantApiKey) {
      clientConfig.apiKey = config.qdrantApiKey;
    }
    
    qdrantClient = new QdrantClient(clientConfig);
  }
  return qdrantClient;
}

export async function initializeCollection(): Promise<boolean> {
  try {
    const client = getQdrantClient();
    
    const collections = await client.getCollections();
    const collectionExists = collections.collections.some(
      col => col.name === COLLECTION_NAME
    );
    
    if (!collectionExists) {
      logger.info(`Creating Qdrant collection: ${COLLECTION_NAME}`);
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: EMBEDDING_DIMENSION,
          distance: 'Cosine',
        },
      });
      logger.info('Collection created successfully');
    } else {
      logger.info(`Collection ${COLLECTION_NAME} already exists`);
    }
    
    return true;
  } catch (error) {
    logger.error('Failed to initialize collection:', error);
    throw error;
  }
}

export async function upsertVectors(points: VectorPoint[]): Promise<boolean> {
  try {
    const client = getQdrantClient();
    
    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points: points.map(point => ({
        id: point.id,
        vector: point.vector,
        payload: {
          text: point.text,
          articleId: point.articleId,
          chunkId: point.chunkId,
          url: point.url,
          title: point.title,
        },
      })),
    });
    
    logger.debug(`Upserted ${points.length} vectors`);
    return true;
  } catch (error) {
    logger.error('Failed to upsert vectors:', error);
    throw error;
  }
}

export async function searchSimilar(queryVector: number[], topK = 5): Promise<RetrievedPassage[]> {
  try {
    const client = getQdrantClient();
    
    logger.info(`[Qdrant] Searching collection "${COLLECTION_NAME}" with topK=${topK}, score_threshold=0.3`);
    const results = await client.search(COLLECTION_NAME, {
      vector: queryVector,
      limit: topK,
      score_threshold: 0.3,
    });
    
    logger.info(`[Qdrant] Search returned ${results.length} results`);
    
    const passages = results.map(result => ({
      score: result.score ?? 0,
      text: (result.payload?.text as string) || '',
      articleId: (result.payload?.articleId as string) || '',
      chunkId: (result.payload?.chunkId as string) || '',
      url: (result.payload?.url as string) || '',
      title: (result.payload?.title as string) || '',
    }));
    
    if (passages.length > 0) {
      logger.info(`[Qdrant] Top result: "${passages[0].title}" (score: ${passages[0].score.toFixed(4)})`);
    }
    
    return passages;
  } catch (error) {
    logger.error('[Qdrant] Failed to search vectors:', error);
    throw error;
  }
}

export async function getCollectionInfo(): Promise<unknown> {
  try {
    const client = getQdrantClient();
    const info = await client.getCollection(COLLECTION_NAME);
    return info;
  } catch (error) {
    logger.error('Failed to get collection info:', error);
    throw error;
  }
}

