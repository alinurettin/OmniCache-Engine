/**
 * OmniCache-Engine - Production In-Memory Cache REST API Server
 * Author: Ali Nurettin Demir (@alinurettin)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { OmniCacheEngine } = require('./engine');

const CAPACITY = parseInt(process.env.CACHE_CAPACITY, 10) || 50;
const MAX_BYTES = parseInt(process.env.CACHE_MAX_BYTES, 10) || (10 * 1024 * 1024); // 10MB
const cache = new OmniCacheEngine({ capacity: CAPACITY, maxBytes: MAX_BYTES });

// Pre-seed with some sample entries
cache.set('session:user_101', { name: 'Alice', role: 'admin', lastLogin: '2026-09-20' }, 300000);
cache.set('config:rate_limit', { max: 100, window: '60s' }, 0);
cache.set('temp:token_auth', 'jwt-token-sample-xyz', 60000);

const PORT = parseInt(process.env.PORT, 10) || 6005;
const publicDir = path.join(__dirname, '..', 'public');
const startTime = Date.now();

function requestHandler(req, res) {
  const reqUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = reqUrl.pathname;

  // CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    // 1. Health Status
    if (pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({
        status: 'UP',
        service: 'OmniCache-Engine',
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString()
      }));
    }

    // 2. Stats & Telemetry
    if (pathname === '/api/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({
        success: true,
        service: 'OmniCache-Engine',
        stats: cache.getStats(),
        chain: cache.getLRUOrder()
      }));
    }

    // 3. GET Key (/api/cache/:key)
    if (req.method === 'GET' && pathname.startsWith('/api/cache/')) {
      const key = decodeURIComponent(pathname.replace('/api/cache/', ''));
      const val = cache.get(key);
      if (val === null) {
        res.writeHead(404, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Cache-Status': 'MISS'
        });
        return res.end(JSON.stringify({ found: false, error: 'Key not found or expired', key }));
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Cache-Status': 'HIT'
      });
      return res.end(JSON.stringify({ found: true, key, value: val }));
    }

    // 4. SET Key (/api/cache)
    if (req.method === 'POST' && pathname === '/api/cache') {
      try {
        const parsed = JSON.parse(body || '{}');
        const resObj = cache.set(parsed.key, parsed.value, parsed.ttlMs || 0);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: true, result: resObj }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    // 5. DELETE Key (/api/cache/:key)
    if (req.method === 'DELETE' && pathname.startsWith('/api/cache/')) {
      const key = decodeURIComponent(pathname.replace('/api/cache/', ''));
      const deleted = cache.delete(key);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ success: true, deleted, key }));
    }

    // 6. CLEAR Cache
    if (req.method === 'POST' && pathname === '/api/cache/clear') {
      cache.clear();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ success: true, message: 'Cache flushed successfully' }));
    }

    // 7. Static Dashboard UI
    let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      return res.end(fs.readFileSync(filePath));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  });
}

function startServer(portToUse = PORT, callback) {
  const server = http.createServer(requestHandler);
  server.listen(portToUse, callback);
  return server;
}

if (require.main === module) {
  startServer(PORT, () => {
    console.log(`💾 OmniCache-Engine live at http://localhost:${PORT}`);
  });
}

module.exports = { startServer, cache };
