// OmniCache-Engine - Production Engine Entrypoint
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');


const LRUCache = require('./engine');
const cache = new LRUCache(1000);
function handleApi(req, res, pathname, body) {
  if (req.method === 'POST' && pathname === '/api/cache/set') {
    try {
      const data = JSON.parse(body || '{}');
      cache.set(data.key, data.value, data.ttlMs || 0);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, key: data.key, size: cache.size() }));
    } catch(e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }
  if (req.method === 'GET' && pathname === '/api/cache/get') {
    const key = require('url').parse(req.url, true).query.key;
    const val = cache.get(key);
    if (val === null) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ found: false, error: 'Key not found or expired' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ found: true, key, value: val }));
  }
  return false;
}


const PORT = parseInt(process.env.PORT, 10) || 6005;
const publicDir = path.join(__dirname, '..', 'public');
const startTime = Date.now();

function requestHandler(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
    });
    return res.end();
  }

  // Aggregate body
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    // 1. Health Endpoint
    if (pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({
        status: 'UP',
        service: 'OmniCache-Engine',
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString()
      }));
    }

    // 2. Stats Endpoint
    if (pathname === '/api/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({
        success: true,
        service: 'OmniCache-Engine',
        category: 'Caching & Storage',
        status: 'OPTIMAL',
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000)
      }));
    }

    // 3. Custom Domain API
    if (typeof handleApi === 'function') {
      const handled = handleApi(req, res, pathname, body);
      if (handled !== false) return;
    }

    // 4. Static Asset Delivery
    let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
    fs.stat(filePath, (err, stats) => {
      if (!err && stats.isFile()) {
        const ext = path.extname(filePath);
        const mime = ext === '.html' ? 'text/html; charset=utf-8' : (ext === '.css' ? 'text/css' : 'application/javascript');
        res.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint Not Found', path: pathname }));
      }
    });
  });
}

function startServer(port = PORT, callback) {
  const s = http.createServer(requestHandler);
  s.listen(port, () => {
    if (callback) callback(s);
  });
  return s;
}

if (require.main === module) {
  startServer(PORT, () => {
    console.log('OmniCache-Engine server running on port ' + PORT);
  });
}

module.exports = { startServer, requestHandler };
