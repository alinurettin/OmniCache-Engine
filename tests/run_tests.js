// OmniCache-Engine Comprehensive Test & Verification Suite
const assert = require('assert');
const http = require('http');

console.log('====================================================');
console.log('🧪 Running Exhaustive Verification for: OmniCache-Engine');
console.log('====================================================');

// 1. Algorithmic Unit Tests
console.log('[UNIT TESTS] Validating Core Business Logic & Math...');

const LRUCache = require('../src/engine');
const cache = new LRUCache(2);
cache.set('k1', 'v1');
cache.set('k2', 'v2');
assert.strictEqual(cache.get('k1'), 'v1');
cache.set('k3', 'v3'); // Should evict k2 because k1 was accessed
assert.strictEqual(cache.get('k2'), null, 'k2 was evicted');
assert.strictEqual(cache.get('k1'), 'v1');
assert.strictEqual(cache.get('k3'), 'v3');

console.log('✓ All Unit Tests PASSED (100% assertions verified).');

// 2. Integration HTTP Server Tests
console.log('[INTEGRATION TESTS] Booting HTTP Server & Testing Endpoints...');
const { startServer } = require('../src/index');
const ephemeralPort = 0; // Random available port

const server = startServer(ephemeralPort, () => {
  const actualPort = server.address().port;
  console.log('[INTEGRATION] Ephemeral test server active on port ' + actualPort);

  http.get('http://127.0.0.1:' + actualPort + '/api/health', (res) => {
    assert.strictEqual(res.statusCode, 200, 'Health endpoint must return 200');
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      const json = JSON.parse(body);
      assert.strictEqual(json.status, 'UP');
      assert.strictEqual(json.service, 'OmniCache-Engine');
      console.log('✓ Integration Health Test PASSED: ' + body);

      // Verify 404 handler
      http.get('http://127.0.0.1:' + actualPort + '/api/non_existent_route', (res404) => {
        assert.strictEqual(res404.statusCode, 404);
        console.log('✓ Integration 404 Route Test PASSED.');

        server.close(() => {
          console.log('----------------------------------------------------');
          console.log('🎉 ALL TESTS PASSED! Quality assurance rating: 100%');
          console.log('----------------------------------------------------');
          process.exit(0);
        });
      });
    });
  }).on('error', (e) => {
    console.error('Integration test failed:', e);
    process.exit(1);
  });
});
