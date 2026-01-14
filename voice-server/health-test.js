// Minimal test server to verify Railway deployment works
import { createServer } from 'http';

const PORT = process.env.PORT || 8080;

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
  } else {
    res.writeHead(200);
    res.end('Voice Server Test');
  }
});

server.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
});
