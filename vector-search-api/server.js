/**
 * Vector Search API Server
 *
 * Provides HTTP API for vector search operations using LanceDB
 * Used by Vercel serverless deployment for KB search
 */

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'vector-search-api',
    timestamp: Date.now()
  });
});

// Status check - reports if vector store is initialized
app.get('/status', async (req, res) => {
  try {
    // Check if .lancedb directory exists with kb_documents table
    const lancedbPath = join(__dirname, '..', '.lancedb');
    const initialized = existsSync(lancedbPath);

    let documentCount = 0;
    if (initialized) {
      try {
        // Dynamic import to prevent bundling issues
        const { connect } = await import('@lancedb/lancedb');
        const db = await connect(lancedbPath);

        try {
          const table = await db.openTable('kb_documents');
          const results = await table.query().limit(1).toArray();
          const count = await table.query().toArray();
          documentCount = count.length;
        } catch (error) {
          // Table doesn't exist
          console.log('Table not found:', error.message);
        }
      } catch (error) {
        console.error('Error checking documents:', error);
      }
    }

    res.json({
      initialized,
      document_count: documentCount,
      message: initialized
        ? `Vector store initialized with ${documentCount} chunks`
        : 'Vector store not initialized'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to check status',
      message: error.message
    });
  }
});

// Search endpoint
app.post('/search', async (req, res) => {
  try {
    const { query, top_k = 5, filters = {} } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Missing required parameter: query'
      });
    }

    // Check if vector store is initialized
    const lancedbPath = join(__dirname, '..', '.lancedb');
    if (!existsSync(lancedbPath)) {
      return res.status(503).json({
        error: 'Vector store not initialized',
        message: 'Run indexing first: npm run index-kb'
      });
    }

    // Dynamic imports
    const { connect } = await import('@lancedb/lancedb');
    const { GoogleGenerativeAI } = await import('@google/genai');

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY not configured'
      });
    }

    // Generate embedding for query
    const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genai.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(query);
    const queryEmbedding = result.embedding.values;

    // Search LanceDB
    const db = await connect(lancedbPath);
    const table = await db.openTable('kb_documents');

    const results = await table
      .vectorSearch(queryEmbedding)
      .limit(top_k)
      .toArray();

    // Transform results
    const documents = results.map(result => {
      const { id, vector, text, _distance, ...metadata } = result;
      return {
        id,
        text,
        metadata,
        distance: _distance || 0,
        score: Math.max(0, 1 - (_distance || 0) / 2)
      };
    });

    // Group by entity_id for response
    const grouped = {};
    documents.forEach(doc => {
      const entityId = doc.metadata.entity_id || 'unknown';
      if (!grouped[entityId]) {
        grouped[entityId] = {
          id: entityId,
          metadata: { ...doc.metadata },
          chunks: []
        };
      }
      grouped[entityId].chunks.push({
        text: doc.text,
        score: doc.score
      });
    });

    res.json({
      ok: true,
      data: {
        results: Object.values(grouped)
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error.message
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Vector Search API listening on port ${PORT}`);
  console.log(`   Health: http://0.0.0.0:${PORT}/health`);
  console.log(`   Status: http://0.0.0.0:${PORT}/status`);
});
