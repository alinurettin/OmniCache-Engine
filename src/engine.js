class LRUCache {
  constructor(capacity = 500) {
    this.capacity = capacity;
    this.cache = new Map();
  }
  set(key, value, ttlMs = 0) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : null;
    this.cache.set(key, { value, expiresAt });
    return true;
  }
  get(key) {
    if (!this.cache.has(key)) return null;
    const item = this.cache.get(key);
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }
  delete(key) { return this.cache.delete(key); }
  size() { return this.cache.size; }
}
module.exports = LRUCache;