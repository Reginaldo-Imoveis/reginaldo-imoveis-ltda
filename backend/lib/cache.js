const { CACHE_TTL } = require('../config');

const MAX_ENTRIES = 500;
const store = new Map();

function evictOldest() {
    // Remove expired entries first
    const now = Date.now();
    for (const [k, v] of store.entries()) {
        if (now - v.ts > CACHE_TTL) store.delete(k);
    }
    // If still over limit, evict by insertion order (Map preserves insertion order)
    while (store.size >= MAX_ENTRIES) {
        const firstKey = store.keys().next().value;
        store.delete(firstKey);
    }
}

function cacheGet(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) { store.delete(key); return null; }
    return entry.data;
}

function cacheSet(key, data) {
    if (store.size >= MAX_ENTRIES) evictOldest();
    store.set(key, { data, ts: Date.now() });
}

function cacheInvalidate(pattern) {
    for (const k of store.keys()) {
        if (k.startsWith(pattern)) store.delete(k);
    }
}

module.exports = { cacheGet, cacheSet, cacheInvalidate };
