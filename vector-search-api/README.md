# Vector Search API

HTTP API service for semantic search over knowledge base documents. Used by Vercel deployment for KB search functionality.

## Architecture

This service provides a REST API for vector search operations:
- Stores embeddings in LanceDB (persistent file-based storage)
- Generates embeddings using Gemini API
- Runs on Railway with persistent storage

## Deployment

### Railway Setup

1. **Create Service in Railway Dashboard**
   - Project: FRAMDESIGN-LIVEAPI
   - Service name: vector-search-api
   - Connect to GitHub repo: framdesign
   - **Root Directory**: `vector-search-api`

2. **Environment Variables**
   Set in Railway dashboard:
   ```
   GEMINI_API_KEY=<your_gemini_api_key>
   ALLOWED_ORIGINS=http://localhost:3000,https://framdesign.vercel.app,https://fram.design
   ```

3. **Deploy**
   - Railway will run the buildCommand from railway.json
   - This automatically runs the KB embedding during build
   - Server starts and serves the API

### Build Process

The `buildCommand` in railway.json:
1. Installs root dependencies
2. Runs the KB embedding script (`npx tsx scripts/Embed/embed-kb.ts`)
3. Installs vector-search-api dependencies
4. Starts the server

This ensures the LanceDB vector store is populated during deployment.

## API Endpoints

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "vector-search-api",
  "timestamp": 1234567890
}
```

### GET /status
Check if vector store is initialized.

**Response:**
```json
{
  "initialized": true,
  "document_count": 25,
  "message": "Vector store initialized with 25 chunks"
}
```

### POST /search
Search for similar documents.

**Request:**
```json
{
  "query": "Who is Andrei?",
  "top_k": 5,
  "filters": {}
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "results": [
      {
        "id": "person:andrei_clodius",
        "metadata": {
          "entity_type": "person",
          "title": "Andrei Clodius",
          ...
        },
        "chunks": [
          {
            "text": "Andrei Clodius is...",
            "score": 0.95
          }
        ]
      }
    ]
  }
}
```

## Local Development

```bash
# Install dependencies
cd vector-search-api
npm install

# Set environment variables
cp .env.example .env
# Edit .env with your GEMINI_API_KEY

# Run embedding (from project root)
cd ..
npx tsx scripts/Embed/embed-kb.ts

# Start server
cd vector-search-api
npm start
```

## Usage from Vercel

The Vercel deployment uses this API when `VECTOR_SEARCH_API_URL` is set:

```typescript
// In Vercel environment
VECTOR_SEARCH_API_URL=https://vector-search-api-production.up.railway.app/

// The vector-store-service.ts automatically uses API mode
const results = await searchSimilar([], 5, {}, "query text");
```

## Troubleshooting

### "Vector store not initialized" error
- The embedding script didn't run during build
- Redeploy the service to trigger the buildCommand
- Or run `npm run index-kb` manually on Railway

### LanceDB errors
- Ensure `@lancedb/lancedb` is installed
- Check that Railway has persistent storage enabled
- Verify the .lancedb directory is created during build

### Search returns no results
- Check that KB documents exist in ../kb/
- Verify GEMINI_API_KEY is set correctly
- Check Railway logs for embedding errors
