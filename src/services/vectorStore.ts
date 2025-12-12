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

