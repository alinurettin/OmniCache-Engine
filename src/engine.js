/**
 * OmniCache-Engine - High-Performance In-Memory Key-Value Store
 * Author: Ali Nurettin Demir (@alinurettin)
 * 
 * Features:
 * - O(1) Doubly-Linked List + Hash Map LRU Eviction Architecture
 * - TTL (Time-To-Live) Expiration Policies with Lazy & Active Pruning
 * - Byte-Level Dynamic Memory Calculation & Hard Memory Cap Enforcement
 * - Disk Snapshotting & Cold-Start Restoration
 * - Comprehensive Hit/Miss & Telemetry Telemetrics
 */

const fs = require('fs');

class LRUNode {
  constructor(key, value, byteSize = 0, expiresAt = null) {
    this.key = key;
    this.value = value;
    this.byteSize = byteSize;
    this.expiresAt = expiresAt;
    this.prev = null;
    this.next = null;
  }
}

class OmniCacheEngine {
  constructor(options = {}) {
    this.capacity = options.capacity || 100; // max items
    this.maxBytes = options.maxBytes || 10 * 1024 * 1024; // 10MB default
    this.defaultTTLMs = options.defaultTTLMs || 0; // 0 = infinite

    this.map = new Map(); // key -> LRUNode
    this.head = null; // MRU (Most Recently Used)
    this.tail = null; // LRU (Least Recently Used)

    this.currentBytes = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.startTime = Date.now();
  }

  _estimateBytes(key, value) {
    const keyBytes = Buffer.byteLength(String(key), 'utf8');
    const valBytes = typeof value === 'string'
      ? Buffer.byteLength(value, 'utf8')
      : Buffer.byteLength(JSON.stringify(value), 'utf8');
    return keyBytes + valBytes + 64; // +64 bytes object pointer overhead
  }

  _detach(node) {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;

    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;

    node.prev = null;
    node.next = null;
  }

  _attachHead(node) {
    node.next = this.head;
    node.prev = null;

    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  _evictTail() {
    if (!this.tail) return null;
    const lru = this.tail;
    this._detach(lru);
    this.map.delete(lru.key);
    this.currentBytes -= lru.byteSize;
    this.evictions++;
    return lru;
  }

  set(key, value, ttlMs = this.defaultTTLMs) {
    if (key === undefined || key === null) throw new Error('Cache key cannot be null or undefined');

    const byteSize = this._estimateBytes(key, value);
    const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : null;

    let node = this.map.get(key);

    if (node) {
      // Update existing key
      this.currentBytes = this.currentBytes - node.byteSize + byteSize;
      node.value = value;
      node.byteSize = byteSize;
      node.expiresAt = expiresAt;
      this._detach(node);
      this._attachHead(node);
    } else {
      // Evict by item capacity limit
      while (this.map.size >= this.capacity && this.tail) {
        this._evictTail();
      }

      // Evict by byte size limit
      while (this.currentBytes + byteSize > this.maxBytes && this.tail) {
        this._evictTail();
      }

      node = new LRUNode(key, value, byteSize, expiresAt);
      this.map.set(key, node);
      this._attachHead(node);
      this.currentBytes += byteSize;
    }

    return { key, byteSize, expiresAt, status: 'STORED' };
  }

  get(key) {
    const node = this.map.get(key);
    if (!node) {
      this.misses++;
      return null;
    }

    // Check TTL expiration
    if (node.expiresAt && Date.now() > node.expiresAt) {
      this._detach(node);
      this.map.delete(key);
      this.currentBytes -= node.byteSize;
      this.misses++;
      return null;
    }

    // Move to head (MRU)
    this._detach(node);
    this._attachHead(node);
    this.hits++;
    return node.value;
  }

  has(key) {
    const node = this.map.get(key);
    if (!node) return false;
    if (node.expiresAt && Date.now() > node.expiresAt) {
      this.get(key); // trigger lazy eviction
      return false;
    }
    return true;
  }

  delete(key) {
    const node = this.map.get(key);
    if (!node) return false;
    this._detach(node);
    this.map.delete(key);
    this.currentBytes -= node.byteSize;
    return true;
  }

  clear() {
    this.map.clear();
    this.head = null;
    this.tail = null;
    this.currentBytes = 0;
  }

  pruneExpired() {
    const now = Date.now();
    let pruned = 0;
    for (const [key, node] of this.map.entries()) {
      if (node.expiresAt && now > node.expiresAt) {
        this._detach(node);
        this.map.delete(key);
        this.currentBytes -= node.byteSize;
        pruned++;
      }
    }
    return pruned;
  }

  getLRUOrder() {
    const order = [];
    let curr = this.head;
    while (curr) {
      order.push({
        key: curr.key,
        byteSize: curr.byteSize,
        expiresInMs: curr.expiresAt ? Math.max(0, curr.expiresAt - Date.now()) : null
      });
      curr = curr.next;
    }
    return order;
  }

  saveSnapshot(filePath) {
    this.pruneExpired();
    const data = [];
    let curr = this.head;
    while (curr) {
      data.push({
        key: curr.key,
        value: curr.value,
        byteSize: curr.byteSize,
        remainingTTL: curr.expiresAt ? Math.max(0, curr.expiresAt - Date.now()) : 0
      });
      curr = curr.next;
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return { path: filePath, count: data.length };
  }

  loadSnapshot(filePath) {
    if (!fs.existsSync(filePath)) throw new Error(`Snapshot file not found: ${filePath}`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    this.clear();
    // Insert in reverse to preserve original MRU order
    for (let i = data.length - 1; i >= 0; i--) {
      const item = data[i];
      this.set(item.key, item.value, item.remainingTTL);
    }
    return { loaded: data.length, currentItems: this.map.size };
  }

  getStats() {
    const totalReqs = this.hits + this.misses;
    const hitRatio = totalReqs > 0 ? ((this.hits / totalReqs) * 100).toFixed(2) : '0.00';
    return {
      itemCount: this.map.size,
      capacity: this.capacity,
      currentBytes: this.currentBytes,
      maxBytes: this.maxBytes,
      memoryUsageMB: (this.currentBytes / (1024 * 1024)).toFixed(3),
      hits: this.hits,
      misses: this.misses,
      hitRatioPercent: Number(hitRatio),
      evictions: this.evictions,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000)
    };
  }
}

module.exports = { LRUNode, OmniCacheEngine };