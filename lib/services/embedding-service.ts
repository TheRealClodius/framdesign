/**
 * Embedding Service
 *
 * Centralized embedding generation using Gemini API.
 * Used by KB tools (kb_search, kb_get) and embedding scripts.
 */

import { GoogleGenAI } from '@google/genai';

// Configuration
// Note: text-embedding-004 was shut down on Jan 14, 2026
// Using gemini-embedding-001 with 768 dimensions for compatibility with existing vector store
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSION = 768;

// Lazy-loaded Gemini client
let genAI: GoogleGenAI | null = null;

/**
 * Initialize Gemini client (lazy loading)
 */
function getGenAI(): GoogleGenAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required for embedding generation');
    }

    // Always use Google AI Studio (API key) for embeddings
    // vertexai: false prevents SDK from auto-detecting GOOGLE_APPLICATION_CREDENTIALS
    genAI = new GoogleGenAI({ apiKey, vertexai: false });
  }

  return genAI;
}

/**
 * Generate embedding for a single text query
 *
 * @param query - Text to embed
 * @returns embedding vector (768 dimensions for compatibility with existing vectors)
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
      contents: [query],
      config: { outputDimensionality: EMBEDDING_DIMENSION }
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
 * @returns Vector dimension (768 for compatibility with existing vectors)
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
