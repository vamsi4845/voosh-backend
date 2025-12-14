import { GoogleGenAI } from '@google/genai';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { RetrievedPassage } from './vectorStore.js';

let genAI: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!genAI) {
    if (!config.geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    genAI = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return genAI;
}

function formatContext(retrievedPassages: RetrievedPassage[]): string {
  if (!retrievedPassages || retrievedPassages.length === 0) {
    return 'No relevant context found.';
  }
  
  return retrievedPassages.map((passage, index) => {
    return `[Source ${index + 1}]: ${passage.title || 'News Article'}\n${passage.text}`;
  }).join('\n\n');
}

function createPrompt(query: string, context: string): string {
  return `You are a helpful assistant that answers questions based on the provided news articles context. Use only the information from the context to answer the question. If the context doesn't contain enough information to answer the question, say so.

Context from news articles:
${context}

Question: ${query}

Please provide a clear and concise answer based on the context above.`;
}

export async function generateResponse(query: string, retrievedPassages: RetrievedPassage[]): Promise<string> {
  try {
    const genAI = getGenAI();
    
    const context = formatContext(retrievedPassages);
    const prompt = createPrompt(query, context);
    
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    
    return result.text || '';
  } catch (error) {
    logger.error('Failed to generate response with Gemini:', error);
    throw error;
  }
}

function isApiLimitError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const errorObj = error as { message?: string; status?: number; code?: number };
    const message = errorObj.message?.toLowerCase() || '';
    const status = errorObj.status || errorObj.code;
    
    return (
      message.includes('quota') ||
      message.includes('rate limit') ||
      message.includes('limit exceeded') ||
      message.includes('429') ||
      status === 429 ||
      status === 403
    );
  }
  return false;
}

function getErrorMessage(error: unknown): string {
  if (isApiLimitError(error)) {
    return 'API rate limit exceeded. Please try again later.';
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An error occurred while generating the response.';
}

export async function* generateStreamResponse(query: string, retrievedPassages: RetrievedPassage[]): AsyncGenerator<string, void, unknown> {
  try {
    const genAI = getGenAI();
    
    const context = formatContext(retrievedPassages);
    const prompt = createPrompt(query, context);
    
    logger.info(`[Gemini] Generating stream response. Prompt length: ${prompt.length} chars, Context passages: ${retrievedPassages.length}`);

    const result = await genAI.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    
    let chunkCount = 0;
    let totalChars = 0;
    
    try {
      for await (const chunk of result) {
        const chunkText = chunk.text;
        if (chunkText) {
          chunkCount++;
          totalChars += chunkText.length;
          yield chunkText;
        }
      }
      
      logger.info(`[Gemini] Stream complete: ${chunkCount} chunks, ${totalChars} total chars`);
    } catch (streamError) {
      if (isApiLimitError(streamError)) {
        logger.error('[Gemini] API rate limit exceeded during streaming');
        throw new Error('API rate limit exceeded. Please try again later.');
      }
      logger.error('[Gemini] Error during stream iteration:', streamError);
      throw streamError;
    }
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error(`[Gemini] Failed to generate stream response: ${errorMessage}`, error);
    throw new Error(errorMessage);
  }
}