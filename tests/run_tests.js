/**
 * OmniCache-Engine - Exhaustive Multi-Scenario Verification Suite
 * Author: Ali Nurettin Demir (@alinurettin)
 * 
 * Verifies:
 * - O(1) Doubly-Linked List + Hash Map LRU eviction invariants
 * - Access-based promotion to head (MRU)
 * - Exact item capacity and byte-level memory limits
 * - TTL expiration policies with lazy eviction
 * - Snapshot file persistence and restoration
 * - Live HTTP server REST API and cache headers
 */

const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { OmniCacheEngine } = require('../src/engine');
const { startServer } = require('../src/index');

console.log('================================================================');
console.log('💾 OmniCache-Engine: Exhaustive Multi-Scenario Verification Suite');
console.log('================================================================\n');

let assertionCount = 0;
function check(cond, msg) {
  assert.ok(cond, msg);
  assertionCount++;
  console.log(`  ✓ [Assertion #${assertionCount}] ${msg}`);
}

// -------------------------------------------------------------
// SECTION 1: Doubly-Linked List LRU Order & Capacity Eviction
// -------------------------------------------------------------
console.log('[SECTION 1] Testing Doubly-Linked List LRU Order & Eviction...');

const cache = new OmniCacheEngine({ capacity: 3 });

cache.set('k1', 'val1');
cache.set('k2', 'val2');
cache.set('k3', 'val3');
check(cache.map.size === 3, 'Cache populated to exact capacity of 3 items');
check(cache.head.key === 'k3', 'Most recently inserted item k3 is at Head (MRU)');
check(cache.tail.key === 'k1', 'First inserted item k1 is at Tail (LRU)');

// Reading k1 promotes it to Head
const v1 = cache.get('k1');
check(v1 === 'val1', 'GET k1 retrieves stored value val1');
check(cache.head.key === 'k1', 'Accessing k1 promoted it to Head (MRU)');
check(cache.tail.key === 'k2', 'k2 was demoted to Tail (LRU)');

// Inserting k4 must evict k2 (current LRU)
cache.set('k4', 'val4');
check(cache.map.size === 3, 'Capacity remains strictly bounded at 3');
check(cache.get('k2') === null, 'LRU item k2 was evicted from the store');
check(cache.evictions === 1, 'Eviction counter accurately incremented to 1');
check(cache.head.key === 'k4', 'New item k4 is positioned at Head');

// Updating existing key
cache.set('k1', 'val1-updated');
check(cache.map.size === 3, 'Updating existing key does not increment item count');
check(cache.get('k1') === 'val1-updated', 'Updated value correctly persisted');
check(cache.head.key === 'k1', 'Updated key promoted to Head');

// -------------------------------------------------------------
// SECTION 2: TTL Expiration Policies & Memory Estimation
// -------------------------------------------------------------
console.log('\n[SECTION 2] Testing TTL Expiration & Memory Limits...');

const ttlCache = new OmniCacheEngine({ capacity: 10, maxBytes: 500 });

// TTL expiration
ttlCache.set('tempKey', 'tempVal', 50); // 50ms TTL
check(ttlCache.has('tempKey') === true, 'Key with TTL is immediately available');

// Wait 70ms for TTL to expire
const now = Date.now();
while (Date.now() - now < 70) { /* tight spin for test */ }

check(ttlCache.get('tempKey') === null, 'Expired key returns null on access');
check(ttlCache.has('tempKey') === false, 'has() returns false for expired key');

// Memory cap enforcement
const bigString = 'X'.repeat(300);
ttlCache.set('big1', bigString);
check(ttlCache.currentBytes > 300, 'Memory byte tracker calculates accurate string allocation');

const bigString2 = 'Y'.repeat(300);
// Exceeds 500 byte limit -> should evict big1 to make room for big2
ttlCache.set('big2', bigString2);
check(ttlCache.get('big1') === null, 'Pre-existing item evicted when byte memory budget exceeded');
check(ttlCache.get('big2') === bigString2, 'New item successfully accommodated within memory budget');

// -------------------------------------------------------------
// SECTION 3: Snapshot Persistence & Restoration
// -------------------------------------------------------------
console.log('\n[SECTION 3] Testing Snapshot Persistence & Disk Restoration...');

const snapCache = new OmniCacheEngine({ capacity: 5 });
snapCache.set('user:1', { name: 'Alice' });
snapCache.set('user:2', { name: 'Bob' });
snapCache.set('user:3', { name: 'Charlie' });

const snapPath = path.join(__dirname, 'test_snapshot.json');
snapCache.saveSnapshot(snapPath);
check(fs.existsSync(snapPath) === true, 'Snapshot JSON file successfully written to disk');

const restoreCache = new OmniCacheEngine({ capacity: 5 });
restoreCache.loadSnapshot(snapPath);
check(restoreCache.map.size === 3, 'Restored cache contains all 3 snapshot items');
check(restoreCache.head.key === 'user:3', 'Restoration preserved original MRU ordering (user:3 at Head)');
check(restoreCache.get('user:1').name === 'Alice', 'Restored item contents match original data');

fs.unlinkSync(snapPath); // cleanup

// -------------------------------------------------------------
// SECTION 4: Live HTTP Server Integration
// -------------------------------------------------------------
console.log('\n[SECTION 4] Testing Live HTTP Ephemeral Server Integration...');

const server = startServer(0, () => {
  const port = server.address().port;
  console.log(`  [HTTP] OmniCache-Engine active on ephemeral port ${port}`);

  // 1. GET /api/health
  http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
    check(res.statusCode === 200, 'GET /api/health returns HTTP 200 OK');

    // 2. POST /api/cache (SET)
    const setPayload = JSON.stringify({ key: 'http:test_key', value: { role: 'tester' }, ttlMs: 60000 });
    const reqSet = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/cache',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(setPayload) }
    }, (resSet) => {
      check(resSet.statusCode === 200, 'POST /api/cache returns HTTP 200 OK');

      // 3. GET /api/cache/:key (CACHE HIT)
      http.get(`http://127.0.0.1:${port}/api/cache/http%3Atest_key`, (resGet) => {
        check(resGet.statusCode === 200, 'GET /api/cache/:key returns HTTP 200 OK');
        check(resGet.headers['x-cache-status'] === 'HIT', 'Cache HIT header returned on existing key');

        // 4. GET non-existent key (CACHE MISS)
        http.get(`http://127.0.0.1:${port}/api/cache/non_existent_key`, (resMiss) => {
          check(resMiss.statusCode === 404, 'GET on missing key returns HTTP 404 Not Found');
          check(resMiss.headers['x-cache-status'] === 'MISS', 'Cache MISS header returned on absent key');

          // 5. DELETE /api/cache/:key
          const reqDel = http.request({
            hostname: '127.0.0.1',
            port,
            path: '/api/cache/http%3Atest_key',
            method: 'DELETE'
          }, (resDel) => {
            check(resDel.statusCode === 200, 'DELETE /api/cache/:key returns HTTP 200 OK');

            server.close(() => {
              console.log('\n================================================================');
              console.log(`🎉 ALL ${assertionCount} ASSERTIONS PASSED WITH 100% SUCCESS!`);
              console.log('================================================================\n');
              process.exit(0);
            });
          });
          reqDel.end();
        });
      });
    });
    reqSet.write(setPayload);
    reqSet.end();
  });
});
