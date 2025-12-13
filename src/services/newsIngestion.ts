import Parser from 'rss-parser';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger.js';

const parser = new Parser();

export interface ArticleChunk {
  id: string;
  text: string;
  articleId: string;
  chunkIndex: number;
}

export interface Article {
  id: string;
  title: string;
  url: string;
  date: string;
  content: string;
  chunks: ArticleChunk[];
}

interface ArticleContent {
  title: string;
  content: string;
}

function chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim().length > 0) {
      chunks.push(chunk.trim());
    }
  }
  
  return chunks;
}

async function fetchArticleContent(url: string): Promise<ArticleContent | null> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });
    
    const $ = cheerio.load(response.data);
    
    $('script, style, nav, header, footer, aside').remove();
    
    const title = $('h1').first().text().trim() || $('title').text().trim();
    const paragraphs = $('p').map((_, el) => $(el).text().trim()).get() as string[];
    const content = paragraphs.filter(p => p.length > 50).join(' ');
    
    return {
      title,
      content: content || $('body').text().trim(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(`Failed to fetch article content from ${url}:`, errorMessage);
    return null;
  }
}

export async function ingestNewsFromRSS(rssUrl: string, maxArticles = 50): Promise<Article[]> {
  try {
    logger.info(`Fetching RSS feed from ${rssUrl}`);
    const feed = await parser.parseURL(rssUrl);
    
    const articles: Article[] = [];
    const articlesToProcess = feed.items?.slice(0, maxArticles) || [];
    
    logger.info(`Found ${articlesToProcess.length} articles, processing...`);
    
    for (let i = 0; i < articlesToProcess.length; i++) {
      const item = articlesToProcess[i];
      if (!item || !item.link) continue;
      
      logger.info(`Processing article ${i + 1}/${articlesToProcess.length}: ${item.title || 'Untitled'}`);
      
      const articleContent = await fetchArticleContent(item.link);
      
      if (articleContent && articleContent.content && articleContent.content.length > 100) {
        const chunks = chunkText(articleContent.content);
        
        if (chunks.length > 0) {
          articles.push({
            id: `article_${i + 1}`,
            title: articleContent.title || item.title || 'Untitled',
            url: item.link,
            date: item.pubDate || new Date().toISOString(),
            content: articleContent.content,
            chunks: chunks.map((chunk, chunkIndex) => ({
              id: `article_${i + 1}_chunk_${chunkIndex}`,
              text: chunk,
              articleId: `article_${i + 1}`,
              chunkIndex,
            })),
          });
        }
      } else {
        logger.warn(`Skipping article ${i + 1}: insufficient content`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    logger.info(`Successfully ingested ${articles.length} articles`);
    return articles;
  } catch (error) {
    logger.error('Failed to ingest news:', error);
    throw error;
  }
}

async function parseReutersSitemapIndex(maxArticles = 50): Promise<string[]> {
  try {
    const sitemapIndexUrl = 'https://www.reuters.com/arc/outboundfeeds/sitemap-index/?outputType=xml';
    logger.info(`Fetching Reuters sitemap-index from ${sitemapIndexUrl}`);
    
    const indexResponse = await axios.get(sitemapIndexUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });
    
    const $index = cheerio.load(indexResponse.data, { xmlMode: true });
    
    const sitemapUrls: string[] = [];
    $index('sitemap > loc').each((_, el) => {
      const url = $index(el).text().trim();
      if (url) {
        sitemapUrls.push(url);
      }
    });
    
    logger.info(`Found ${sitemapUrls.length} sitemaps in index`);
    
    const articleUrls: string[] = [];
    const sitemapsToProcess = Math.ceil(maxArticles / 100);
    
    for (let i = 0; i < Math.min(sitemapsToProcess, sitemapUrls.length); i++) {
      const sitemapUrl = sitemapUrls[i];
      if (!sitemapUrl) continue;
      
      try {
        logger.info(`Fetching sitemap ${i + 1}/${Math.min(sitemapsToProcess, sitemapUrls.length)}: ${sitemapUrl}`);
        const sitemapResponse = await axios.get(sitemapUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 10000,
        });
        
        const $sitemap = cheerio.load(sitemapResponse.data, { xmlMode: true });
        
        $sitemap('url > loc').each((_, el) => {
          const url = $sitemap(el).text().trim();
          if (url && articleUrls.length < maxArticles) {
            articleUrls.push(url);
          }
        });
        
        if (articleUrls.length >= maxArticles) {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.warn(`Failed to fetch sitemap ${sitemapUrl}: ${errorMessage}`);
      }
    }
    
    logger.info(`Extracted ${articleUrls.length} article URLs from sitemaps`);
    return articleUrls;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to parse Reuters sitemap-index: ${errorMessage}`);
    return [];
  }
}

export async function ingestFromReutersSitemap(maxArticles = 50): Promise<Article[]> {
  try {
    logger.info('Attempting to fetch articles from Reuters sitemap-index...');
    
    const articleUrls = await parseReutersSitemapIndex(maxArticles);
    
    if (articleUrls.length > 0) {
      logger.info(`Found ${articleUrls.length} article URLs from sitemap-index, processing...`);
      
      const articles: Article[] = [];
      
      for (let i = 0; i < articleUrls.length; i++) {
        const url = articleUrls[i];
        if (!url) continue;
        
        logger.info(`Processing article ${i + 1}/${articleUrls.length}: ${url}`);
        
        const articleContent = await fetchArticleContent(url);
        
        if (articleContent && articleContent.content && articleContent.content.length > 100) {
          const chunks = chunkText(articleContent.content);
          
          if (chunks.length > 0) {
            articles.push({
              id: `article_${i + 1}`,
              title: articleContent.title || 'Untitled',
              url: url,
              date: new Date().toISOString(),
              content: articleContent.content,
              chunks: chunks.map((chunk, chunkIndex) => ({
                id: `article_${i + 1}_chunk_${chunkIndex}`,
                text: chunk,
                articleId: `article_${i + 1}`,
                chunkIndex,
              })),
            });
          }
        } else {
          logger.warn(`Skipping article ${i + 1}: insufficient content`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (articles.length > 0) {
        logger.info(`Successfully ingested ${articles.length} articles from Reuters sitemap`);
        return articles;
      }
    }
    
    logger.warn('No articles found from sitemap-index, falling back to RSS feeds...');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(`Failed to fetch from Reuters sitemap-index: ${errorMessage}, falling back to RSS feeds...`);
  }
  
  const rssFeeds = [
    'https://feeds.bbci.co.uk/news/rss.xml',
    'https://feeds.bbci.co.uk/news/technology/rss.xml',
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://rss.cnn.com/rss/edition.rss',
    'https://rss.cnn.com/rss/edition_technology.rss',
    'https://techcrunch.com/feed/',
    'https://www.theguardian.com/world/rss',
    'https://www.theguardian.com/technology/rss',
  ];
  
  logger.info(`Trying ${rssFeeds.length} RSS feeds as fallback...`);
  
  for (const feedUrl of rssFeeds) {
    try {
      logger.info(`Attempting to fetch from ${feedUrl}...`);
      return await ingestNewsFromRSS(feedUrl, maxArticles);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.warn(`Failed to fetch from ${feedUrl}: ${errorMessage}, trying next...`);
    }
  }
  
  throw new Error('Failed to fetch from any source');
}

