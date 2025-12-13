import { ingestFromReutersSitemap } from '../services/newsIngestion.js';
import { getEmbeddingsBatch } from '../services/embeddingService.js';
import { initializeCollection, upsertVectors, VectorPoint } from '../services/vectorStore.js';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

async function ingestNews(): Promise<void> {
  try {
    logger.info('Starting news ingestion process...');
    
    logger.info('Step 1: Initializing vector store collection...');
    await initializeCollection();
    
    logger.info('Step 2: Fetching and parsing news articles...');
    const articles = await ingestFromReutersSitemap(50);
    
    if (articles.length === 0) {
      logger.error('No articles were ingested');
      process.exit(1);
    }
    
    logger.info(`Step 3: Processing ${articles.length} articles...`);
    
    const allChunks: Array<{
      id: string;
      text: string;
      articleId: string;
      chunkIndex: number;
      url: string;
      title: string;
    }> = [];
    
    articles.forEach(article => {
      article.chunks.forEach(chunk => {
        allChunks.push({
          ...chunk,
          url: article.url,
          title: article.title,
        });
      });
    });
    
    logger.info(`Step 4: Generating embeddings for ${allChunks.length} chunks...`);
    const texts = allChunks.map(chunk => chunk.text);
    const embeddings = await getEmbeddingsBatch(texts);
    
    if (embeddings.length !== allChunks.length) {
      throw new Error(`Embedding count mismatch: expected ${allChunks.length}, got ${embeddings.length}`);
    }
    
    logger.info('Step 5: Upserting vectors to Qdrant...');
    const points: VectorPoint[] = allChunks.map((chunk, index) => ({
      id: randomUUID(),
      vector: embeddings[index],
      text: chunk.text,
      articleId: chunk.articleId,
      chunkId: chunk.id,
      url: chunk.url,
      title: chunk.title,
    }));
    
    const batchSize = 100;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      await upsertVectors(batch);
      logger.info(`Upserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(points.length / batchSize)}`);
    }
    
    logger.info('News ingestion completed successfully!');
    logger.info(`Total articles: ${articles.length}`);
    logger.info(`Total chunks: ${allChunks.length}`);
    logger.info(`Total vectors: ${points.length}`);
    
    process.exit(0);
  } catch (error) {
    logger.error('News ingestion failed:', error);
    process.exit(1);
  }
}

ingestNews();

