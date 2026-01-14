/**
 * Embedding Service
 *
 * Centralized embedding generation using Gemini API.
 * Used by KB tools (kb_search, kb_get) and embedding scripts.
 */

import { GoogleGenAI } from '@google/genai';

// Configuration
const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIMENSION = 768;

// Lazy-loaded Gemini client
let genAI: GoogleGenAI | null = null;

/**
 * Initialize Gemini client (lazy loading)
 */
function getGenAI(): GoogleGenAI {
  if (!genAI) {
    // Support both legacy and documented env var names.
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY (or GOOGLE_GENAI_API_KEY) environment variable is required for embedding generation');
    }

    genAI = new GoogleGenAI({ apiKey });
  }

  return genAI;
}

/**
 * Generate embedding for a single text query
 *
 * @param query - Text to embed
 * @returns 768-dimensional embedding vector
 * @throws Error if API call fails
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  if (!query || query.trim().length === 0) {
    throw new Error('Query text cannot be empty');
  }

  try {
    const client = getGenAI();

    const result = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [query]
    });

    if (result.embeddings && result.embeddings.length > 0 && result.embeddings[0].values) {
      return result.embeddings[0].values;
    }

    throw new Error('No embedding values returned from Gemini API');
  } catch (error: any) {
    // Enhance error message
    if (error.message?.includes('API key')) {
      throw new Error('Invalid or missing GEMINI_API_KEY');
    }
    if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
      throw new Error('Gemini API rate limit exceeded. Please try again later.');
    }
    if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
      throw new Error('Gemini API request timed out. Please try again.');
    }

    throw new Error(`Embedding generation failed: ${error.message}`);
  }
}

/**
 * Get embedding model dimension
 *
 * @returns Vector dimension (768 for text-embedding-004)
 */
export function getEmbeddingDimension(): number {
  return EMBEDDING_DIMENSION;
}

/**
 * Get embedding model name
 *
 * @returns Model identifier
 */
export function getEmbeddingModel(): string {
  return EMBEDDING_MODEL;
}
