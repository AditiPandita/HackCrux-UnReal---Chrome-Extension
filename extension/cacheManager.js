// ShareSafe - Caching System for Segment Analysis
// Efficient caching using URL + content hash

// ═══════════════════════════════════════════════════════════════
// HASH GENERATION
// ═══════════════════════════════════════════════════════════════

/**
 * Generate simple hash for text content
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate cache key for page
 */
export function generatePageCacheKey(url, contentSample) {
  const urlHash = simpleHash(url);
  const contentHash = simpleHash(contentSample.slice(0, 500));
  return `page_${urlHash}_${contentHash}`;
}

/**
 * Generate cache key for segment
 */
export function generateSegmentCacheKey(segmentText) {
  return `seg_${simpleHash(segmentText)}`;
}

/**
 * Generate cache key for image
 */
export function generateImageCacheKey(imageSrc) {
  return `img_${simpleHash(imageSrc)}`;
}

// ═══════════════════════════════════════════════════════════════
// CACHE STORAGE (Chrome Storage API)
// ═══════════════════════════════════════════════════════════════

const CACHE_DURATION = {
  page: 30 * 60 * 1000,      // 30 minutes
  segment: 60 * 60 * 1000,   // 1 hour
  image: 2 * 60 * 60 * 1000  // 2 hours
};

const MAX_CACHE_SIZE = {
  page: 50,
  segment: 200,
  image: 100
};

/**
 * Get cached result
 */
export async function getCached(key, type = 'page') {
  try {
    const storageKey = `cache_${type}`;
    const data = await chrome.storage.local.get([storageKey]);
    const cache = data[storageKey] || {};
    
    const entry = cache[key];
    if (!entry) return null;
    
    // Check expiration
    const duration = CACHE_DURATION[type];
    if (Date.now() - entry.timestamp > duration) {
      // Expired
      delete cache[key];
      await chrome.storage.local.set({ [storageKey]: cache });
      return null;
    }
    
    return entry.data;
  } catch (error) {
    console.error('ShareSafe: Cache read error', error);
    return null;
  }
}

/**
 * Set cached result
 */
export async function setCached(key, data, type = 'page') {
  try {
    const storageKey = `cache_${type}`;
    const stored = await chrome.storage.local.get([storageKey]);
    let cache = stored[storageKey] || {};
    
    // Clean expired entries
    const duration = CACHE_DURATION[type];
    const now = Date.now();
    Object.keys(cache).forEach(k => {
      if (now - cache[k].timestamp > duration) {
        delete cache[k];
      }
    });
    
    // Enforce size limit (LRU-style)
    const entries = Object.entries(cache);
    if (entries.length >= MAX_CACHE_SIZE[type]) {
      // Remove oldest entries
      entries
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, entries.length - MAX_CACHE_SIZE[type] + 1)
        .forEach(([k]) => delete cache[k]);
    }
    
    // Add new entry
    cache[key] = {
      data,
      timestamp: now
    };
    
    await chrome.storage.local.set({ [storageKey]: cache });
  } catch (error) {
    console.error('ShareSafe: Cache write error', error);
  }
}

/**
 * Clear all caches
 */
export async function clearAllCaches() {
  try {
    await chrome.storage.local.remove(['cache_page', 'cache_segment', 'cache_image']);
    console.log('ShareSafe: All caches cleared');
  } catch (error) {
    console.error('ShareSafe: Cache clear error', error);
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  try {
    const data = await chrome.storage.local.get(['cache_page', 'cache_segment', 'cache_image']);
    
    return {
      page: Object.keys(data.cache_page || {}).length,
      segment: Object.keys(data.cache_segment || {}).length,
      image: Object.keys(data.cache_image || {}).length
    };
  } catch (error) {
    console.error('ShareSafe: Cache stats error', error);
    return { page: 0, segment: 0, image: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════
// BATCH CACHING FOR SEGMENTS
// ═══════════════════════════════════════════════════════════════

/**
 * Get multiple cached segments at once
 */
export async function getCachedSegments(segmentTexts) {
  try {
    const keys = segmentTexts.map(text => generateSegmentCacheKey(text));
    const data = await chrome.storage.local.get(['cache_segment']);
    const cache = data.cache_segment || {};
    
    const results = {};
    const duration = CACHE_DURATION.segment;
    const now = Date.now();
    
    keys.forEach((key, index) => {
      const entry = cache[key];
      if (entry && (now - entry.timestamp <= duration)) {
        results[segmentTexts[index]] = entry.data;
      }
    });
    
    return results;
  } catch (error) {
    console.error('ShareSafe: Batch cache read error', error);
    return {};
  }
}

/**
 * Set multiple segment caches at once
 */
export async function setCachedSegments(segmentResults) {
  try {
    const data = await chrome.storage.local.get(['cache_segment']);
    let cache = data.cache_segment || {};
    
    const now = Date.now();
    const duration = CACHE_DURATION.segment;
    
    // Clean expired
    Object.keys(cache).forEach(k => {
      if (now - cache[k].timestamp > duration) {
        delete cache[k];
      }
    });
    
    // Add new entries
    Object.entries(segmentResults).forEach(([text, result]) => {
      const key = generateSegmentCacheKey(text);
      cache[key] = {
        data: result,
        timestamp: now
      };
    });
    
    // Enforce size limit
    const entries = Object.entries(cache);
    if (entries.length > MAX_CACHE_SIZE.segment) {
      const toKeep = entries
        .sort((a, b) => b[1].timestamp - a[1].timestamp)
        .slice(0, MAX_CACHE_SIZE.segment);
      
      cache = Object.fromEntries(toKeep);
    }
    
    await chrome.storage.local.set({ cache_segment: cache });
  } catch (error) {
    console.error('ShareSafe: Batch cache write error', error);
  }
}
