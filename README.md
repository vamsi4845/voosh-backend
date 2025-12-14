# RAG Chatbot Backend

A Node.js/Express backend for a RAG-powered chatbot that answers questions over a news corpus using Retrieval-Augmented Generation (RAG) pipeline.

## Tech Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Real-time**: Socket.io
- **Vector Database**: Qdrant
- **Embeddings**: Jina Embeddings API
- **LLM**: Google Gemini API
- **Cache/Sessions**: Redis
- **News Ingestion**: RSS Parser + Cheerio

## Features

- RAG pipeline: News ingestion → Embeddings → Vector store → Retrieval → Gemini generation
- REST API endpoints for chat and session management
- Socket.io for streaming responses
- Redis-based session history with TTL
- Automatic session ID generation
- Health check endpoint

## Prerequisites

- Node.js 18+ 
- API keys:
  - Google Gemini API key ([Get one here](https://aistudio.google.com/apikey))
  - Jina Embeddings API key ([Get one here](https://jina.ai/embeddings))

## Installation

1. Clone the repository
```bash
git clone https://github.com/vamsi4845/voosh-backend
cd voosh-backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up cloud services (recommended - free tier available):

### Option 1: Cloud Services (Recommended)

**Upstash Redis** (Free tier: 10K commands/day):
1. Sign up at https://upstash.com/
2. Create a Redis database
3. Copy the Redis URL (format: `redis://default:password@endpoint.upstash.io:6379`)

**Qdrant Cloud** (Free tier: 1GB storage):
1. Sign up at https://cloud.qdrant.io/
2. Create a free cluster
3. Copy your cluster URL (format: `https://your-cluster.qdrant.io`)

4. Create `.env` file in the backend directory with your configuration:
```env
PORT=3001
GEMINI_API_KEY=your_gemini_api_key_here
JINA_API_KEY=your_jina_api_key_here
QDRANT_URL=https://your-cluster.qdrant.io
REDIS_URL=redis://default:password@your-endpoint.upstash.io:6379
SESSION_TTL=86400
QUERY_CACHE_TTL=3600
NODE_ENV=development
FRONTEND_URL=your_frontend_url_here
```

### Option 2: Local Development (Alternative)

If you prefer local development, install services directly:

**Redis**:
- macOS: `brew install redis && brew services start redis`
- Ubuntu: `sudo apt-get install redis-server && sudo systemctl start redis`
- Windows: Download from [redis.io](https://redis.io/download)

**Qdrant**: 
- Download binaries from [GitHub releases](https://github.com/qdrant/qdrant/releases)
- Or use the installation guide: https://qdrant.tech/documentation/install/

Then use local URLs in `.env`:
```env
QDRANT_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:5173
```

## News Ingestion

Before starting the server, you need to ingest news articles into the vector store:

```bash
npm run ingest
```

This script will:
1. Fetch ~50 articles from Reuters RSS feeds
2. Extract and chunk article content
3. Generate embeddings using Jina API
4. Store embeddings in Qdrant vector store

**Note**: This process may take several minutes depending on the number of articles and API rate limits.

## Starting the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The server will start on `http://localhost:3001` (or the port specified in `.env`).

## API Endpoints

### Health Check
```
GET /api/health
```
Returns server health status and service connectivity.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "redis": "connected",
    "qdrant": "connected"
  }
}
```

### Send Chat Message (REST)
```
POST /api/chat
Content-Type: application/json

{
  "sessionId": "optional-uuid",
  "message": "What are the latest news about technology?"
}
```

**Response:**
```json
{
  "sessionId": "generated-uuid",
  "response": {
    "role": "assistant",
    "content": "Based on the news articles...",
    "sources": [
      {
        "title": "Article Title",
        "url": "https://example.com/article",
        "score": 0.85
      }
    ],
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get Session History
```
GET /api/session/:sessionId/history
```

**Response:**
```json
{
  "sessionId": "uuid",
  "messages": [
    {
      "role": "user",
      "content": "Hello",
      "timestamp": "2024-01-01T00:00:00.000Z"
    },
    {
      "role": "assistant",
      "content": "Hi! How can I help?",
      "sources": [],
      "timestamp": "2024-01-01T00:00:01.000Z"
    }
  ]
}
```

### Clear Session
```
DELETE /api/session/:sessionId
```

**Response:**
```json
{
  "success": true,
  "message": "Session cleared"
}
```

## Socket.io Events

### Client → Server

**`chat:message`**
```javascript
socket.emit('chat:message', {
  sessionId: 'optional-uuid',
  message: 'Your question here'
});
```

### Server → Client

**`chat:session`** - New session ID generated
```javascript
socket.on('chat:session', (data) => {
  console.log('Session ID:', data.sessionId);
});
```

**`chat:user_message`** - User message confirmation
```javascript
socket.on('chat:user_message', (message) => {
  console.log('User message:', message);
});
```

**`chat:sources`** - Retrieved sources
```javascript
socket.on('chat:sources', (data) => {
  console.log('Sources:', data.sources);
});
```

**`chat:response`** - Streaming response chunks
```javascript
socket.on('chat:response', (data) => {
  console.log('Chunk:', data.text);
});
```

**`chat:complete`** - Response complete
```javascript
socket.on('chat:complete', (message) => {
  console.log('Complete message:', message);
});
```

**`chat:error`** - Error occurred
```javascript
socket.on('chat:error', (data) => {
  console.error('Error:', data.message);
});
```

## Configuration

### Environment Variables

| Variable | Description | Default/Example |
|----------|-------------|-----------------|
| `PORT` | Server port | `3001` |
| `GEMINI_API_KEY` | Google Gemini API key | Required |
| `JINA_API_KEY` | Jina Embeddings API key | Required |
| `QDRANT_URL` | Qdrant server URL | `https://your-cluster.qdrant.io` (cloud) or `http://localhost:6333` (local) |
| `REDIS_URL` | Redis connection URL | `redis://default:password@endpoint.upstash.io:6379` (cloud) or `redis://localhost:6379` (local) |
| `SESSION_TTL` | Session TTL in seconds | `86400` (24 hours) |
| `QUERY_CACHE_TTL` | Query result cache TTL in seconds | `3600` (1 hour) |
| `NODE_ENV` | Environment | `development` |
| `FRONTEND_URL` | CORS allowed origin | `http://localhost:5173` |

### Session TTL Configuration

Sessions are stored in Redis with a Time-To-Live (TTL). By default, sessions expire after 24 hours (86400 seconds).

To configure TTL:

1. Set `SESSION_TTL` in `.env`:
```env
SESSION_TTL=3600  # 1 hour
SESSION_TTL=604800  # 7 days
SESSION_TTL=2592000  # 30 days
```

2. TTL is applied when:
   - A new message is saved to a session
   - The session key is refreshed with the new TTL

### Query Result Caching

Query results are automatically cached in Redis to improve performance and reduce API costs. When a query is processed, the result is cached and reused for subsequent identical queries until the cache expires.

**Cache Configuration:**

- Cache key: Based on SHA-256 hash of the normalized query text
- Default TTL: 1 hour (3600 seconds)
- Configure via `QUERY_CACHE_TTL` environment variable:

```env
QUERY_CACHE_TTL=1800   # 30 minutes
QUERY_CACHE_TTL=3600   # 1 hour (default)
QUERY_CACHE_TTL=7200   # 2 hours
QUERY_CACHE_TTL=86400  # 24 hours
```

**How it works:**
- Queries are normalized (lowercased and trimmed) before hashing
- Cache is checked before processing each query
- If cached result exists, it's returned immediately (no API calls)
- If not cached, query is processed and result is stored in cache
- Cache automatically expires after TTL period

**Benefits:**
- Reduces API costs (Jina embeddings + Gemini API)
- Improves response times for repeated queries
- Reduces load on external services

### Cache Warming

To pre-load popular queries or warm up the cache:

The cache warming script is already set up at `src/scripts/warmCache.ts`. You can customize the `popularQueries` array in the script to match your needs.

Run the cache warming script:
```bash
npm run warm-cache
```

**Note**: Cache warming is optional and mainly useful for production deployments to improve response times for common queries. The script automatically checks if queries are already cached before processing them, so it's safe to run multiple times. It processes each uncached query sequentially with a 1-second delay between queries to respect API rate limits.

## Project Structure

```
backend/
├── src/
│   ├── server.js              # Express + Socket.io server
│   ├── config/
│   │   └── config.js          # Environment configuration
│   ├── routes/
│   │   ├── chat.js            # REST chat endpoints
│   │   ├── session.js         # Session management
│   │   └── health.js          # Health check
│   ├── services/
│   │   ├── ragService.js      # RAG pipeline orchestration
│   │   ├── embeddingService.js # Jina embeddings
│   │   ├── vectorStore.js     # Qdrant operations
│   │   ├── geminiService.js   # Gemini API
│   │   └── newsIngestion.js   # RSS/HTML scraping
│   ├── utils/
│   │   ├── redisClient.js     # Redis operations
│   │   ├── sessionManager.js  # Session ID management
│   │   └── logger.js           # Logging utility
│   └── scripts/
│       └── ingestNews.js      # News ingestion script
├── package.json
└── README.md
```

## RAG Pipeline Flow

1. **Query Reception**: User sends a query via REST API or Socket.io
2. **Query Embedding**: Query is embedded using Jina Embeddings API
3. **Vector Search**: Similar passages are retrieved from Qdrant (top-k)
4. **Context Augmentation**: Retrieved passages are formatted as context
5. **Generation**: Gemini API generates response based on context
6. **Streaming**: Response is streamed back to client via Socket.io
7. **Storage**: Conversation is saved to Redis with TTL

## Deployment

### Recommended: Use Cloud Services

For production deployment, use cloud services (all have free tiers):

1. **Upstash Redis**: https://upstash.com/ (free tier: 10K commands/day)
2. **Qdrant Cloud**: https://cloud.qdrant.io/ (free tier: 1GB storage)

### Deploy Backend

#### Render.com

1. Create a new Web Service
2. Connect your repository
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables in Render dashboard:
   - `GEMINI_API_KEY`
   - `JINA_API_KEY`
   - `QDRANT_URL` (from Qdrant Cloud)
   - `REDIS_URL` (from Upstash Redis)
   - `SESSION_TTL=86400`
   - `FRONTEND_URL` (your frontend URL)

#### Railway

1. Create a new project
2. Deploy backend code
3. Set environment variables (use cloud service URLs)
4. Run ingestion script: `npm run ingest` (via Railway CLI or dashboard)

#### Other Platforms

Any Node.js hosting platform works (Vercel, Heroku, etc.). Just ensure:
- Environment variables are set correctly
- Use cloud Redis (Upstash) and Qdrant Cloud URLs
- Run `npm run ingest` after deployment to populate the vector store

### Environment Variables for Production

**Required**:
- `GEMINI_API_KEY` - Google Gemini API key
- `JINA_API_KEY` - Jina Embeddings API key
- `QDRANT_URL` - Qdrant Cloud cluster URL (recommended)
- `REDIS_URL` - Upstash Redis URL (recommended)

**Optional**:
- `SESSION_TTL` - Default: 86400 (24 hours)
- `QUERY_CACHE_TTL` - Default: 3600 (1 hour)
- `FRONTEND_URL` - Your frontend URL
- `PORT` - Server port (default: 3001)

## Troubleshooting

### Redis Connection Issues
- **Cloud (Upstash)**: Verify connection string format matches `redis://default:password@endpoint.upstash.io:6379`
- **Local**: Ensure Redis is running: `redis-cli ping` should return `PONG`
- Check `REDIS_URL` in `.env` - ensure no extra spaces or quotes
- For Upstash, verify database is active in dashboard

### Qdrant Connection Issues
- **Cloud (Qdrant Cloud)**: Verify cluster URL format: `https://your-cluster.qdrant.io`
- **Local**: Ensure Qdrant is running: `curl http://localhost:6333/collections`
- Check `QDRANT_URL` in `.env` - ensure HTTPS for cloud, HTTP for local
- Verify collection exists: Run ingestion script (`npm run ingest`)
- For Qdrant Cloud, check cluster status in dashboard

### API Key Issues
- Verify API keys are set correctly in `.env`
- Check API key validity and rate limits
- Ensure no extra spaces or quotes in `.env` file

### Embedding Generation Fails
- Check Jina API key and rate limits
- Verify network connectivity
- Check API response in logs

### Links
- [Frontend Repository](https://github.com/vamsi4845/voosh-frontend)
- [Live](https://voosh-newsly.vercel.app/)

