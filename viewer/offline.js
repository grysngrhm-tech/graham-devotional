/**
 * The Graham Bible - Offline Storage Module
 * ============================================================================
 * Manages IndexedDB for offline story caching and user library.
 * 
 * Two stores:
 * 1. story-cache: Automatic LRU cache for recently viewed stories (all users)
 * 2. library: User's intentionally saved offline library (logged-in users)
 * ============================================================================
 */

const DB_NAME = 'graham-bible-offline';
const DB_VERSION = 1;
const CACHE_STORE = 'story-cache';
const LIBRARY_STORE = 'library';
const MAX_CACHE_SIZE = 100; // LRU eviction after 100 stories

let db = null;

// ============================================================================
// Database Initialization
// ============================================================================

/**
 * Open/create the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
async function openDatabase() {
    if (db) return db;
    
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => {
            console.error('[Offline] Failed to open database:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            
            // Story cache store (automatic, LRU evicted)
            if (!database.objectStoreNames.contains(CACHE_STORE)) {
                const cacheStore = database.createObjectStore(CACHE_STORE, { keyPath: 'spread_code' });
                cacheStore.createIndex('last_viewed', 'last_viewed', { unique: false });
            }
            
            // Library store (user's saved stories, never evicted)
            if (!database.objectStoreNames.contains(LIBRARY_STORE)) {
                const libraryStore = database.createObjectStore(LIBRARY_STORE, { keyPath: 'spread_code' });
                libraryStore.createIndex('saved_at', 'saved_at', { unique: false });
            }
        };
    });
}

// ============================================================================
// Story Cache (Automatic - All Users)
// ============================================================================

/**
 * Save a story to the automatic cache
 * @param {Object} story - Full story object from Supabase
 */
async function cacheStory(story) {
    if (!story?.spread_code) return;
    
    try {
        const database = await openDatabase();
        const tx = database.transaction(CACHE_STORE, 'readwrite');
        const store = tx.objectStore(CACHE_STORE);
        
        const cacheEntry = {
            spread_code: story.spread_code,
            data: story,
            last_viewed: Date.now()
        };
        
        store.put(cacheEntry);
        
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        
        // Prune cache if needed (run async, don't block)
        pruneCache();
        
    } catch (err) {
        console.error('[Offline] Failed to cache story:', err);
    }
}

/**
 * Get a story from cache
 * @param {string} spreadCode
 * @returns {Promise<Object|null>}
 */
async function getCachedStory(spreadCode) {
    try {
        const database = await openDatabase();
        const tx = database.transaction(CACHE_STORE, 'readonly');
        const store = tx.objectStore(CACHE_STORE);
        
        return new Promise((resolve, reject) => {
            const request = store.get(spreadCode);
            request.onsuccess = () => {
                const entry = request.result;
                if (entry) {
                    // Update last_viewed timestamp (don't await)
                    updateCacheTimestamp(spreadCode);
                    resolve(entry.data);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.error('[Offline] Failed to get cached story:', err);
        return null;
    }
}

/**
 * Update the last_viewed timestamp for a cached story
 */
async function updateCacheTimestamp(spreadCode) {
    try {
        const database = await openDatabase();
        const tx = database.transaction(CACHE_STORE, 'readwrite');
        const store = tx.objectStore(CACHE_STORE);
        
        const request = store.get(spreadCode);
        request.onsuccess = () => {
            const entry = request.result;
            if (entry) {
                entry.last_viewed = Date.now();
                store.put(entry);
            }
        };
    } catch (err) {
        // Non-critical, ignore errors
    }
}

/**
 * Prune cache to MAX_CACHE_SIZE entries (LRU eviction)
 */
async function pruneCache() {
    try {
        const database = await openDatabase();
        const tx = database.transaction(CACHE_STORE, 'readwrite');
        const store = tx.objectStore(CACHE_STORE);
        const index = store.index('last_viewed');
        
        // Count entries
        const countRequest = store.count();
        countRequest.onsuccess = () => {
            const count = countRequest.result;
            if (count <= MAX_CACHE_SIZE) return;
            
            // Get oldest entries to delete
            const toDelete = count - MAX_CACHE_SIZE;
            let deleted = 0;
            
            const cursorRequest = index.openCursor();
            cursorRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && deleted < toDelete) {
                    store.delete(cursor.primaryKey);
                    deleted++;
                    cursor.continue();
                }
            };
        };
    } catch (err) {
        console.error('[Offline] Failed to prune cache:', err);
    }
}

/**
 * Get all cached story codes
 * @returns {Promise<Set<string>>}
 */
async function getCachedStoryCodes() {
    try {
        const database = await openDatabase();
        const tx = database.transaction(CACHE_STORE, 'readonly');
        const store = tx.objectStore(CACHE_STORE);
        
        return new Promise((resolve, reject) => {
            const codes = new Set();
            const request = store.openCursor();
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    codes.add(cursor.key);
                    cursor.continue();
                } else {
                    resolve(codes);
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.error('[Offline] Failed to get cached codes:', err);
        return new Set();
    }
}

/**
 * Clear all cached stories
 */
async function clearCache() {
    try {
        const database = await openDatabase();
        const tx = database.transaction(CACHE_STORE, 'readwrite');
        const store = tx.objectStore(CACHE_STORE);
        store.clear();
        
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        
        // Also clear image cache
        if ('caches' in window) {
            await caches.delete('graham-bible-images');
        }
        
    } catch (err) {
        console.error('[Offline] Failed to clear cache:', err);
        throw err;
    }
}

/**
 * Get cache statistics
 * @returns {Promise<{count: number, sizeEstimate: number}>}
 */
async function getCacheStats() {
    try {
        const database = await openDatabase();
        const tx = database.transaction(CACHE_STORE, 'readonly');
        const store = tx.objectStore(CACHE_STORE);
        
        return new Promise((resolve, reject) => {
            const countRequest = store.count();
            countRequest.onsuccess = () => {
                const count = countRequest.result;
                // Estimate ~105KB per story (5KB data + 100KB image)
                const sizeEstimate = count * 105 * 1024;
                resolve({ count, sizeEstimate });
            };
            countRequest.onerror = () => reject(countRequest.error);
        });
    } catch (err) {
        console.error('[Offline] Failed to get cache stats:', err);
        return { count: 0, sizeEstimate: 0 };
    }
}

// ============================================================================
// Library (Intentional - Logged-In Users)
// ============================================================================

/**
 * Save a story to the user's offline library
 * @param {Object} story - Full story object
 */
async function saveToLibrary(story) {
    if (!story?.spread_code) return;
    
    try {
        const database = await openDatabase();
        const tx = database.transaction(LIBRARY_STORE, 'readwrite');
        const store = tx.objectStore(LIBRARY_STORE);
        
        const libraryEntry = {
            spread_code: story.spread_code,
            data: story,
            saved_at: Date.now()
        };
        
        store.put(libraryEntry);
        
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        
    } catch (err) {
        console.error('[Offline] Failed to save to library:', err);
        throw err;
    }
}

/**
 * Remove a story from the library
 * @param {string} spreadCode
 */
async function removeFromLibrary(spreadCode) {
    try {
        const database = await openDatabase();
        const tx = database.transaction(LIBRARY_STORE, 'readwrite');
        const store = tx.objectStore(LIBRARY_STORE);
        
        store.delete(spreadCode);
        
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        
    } catch (err) {
        console.error('[Offline] Failed to remove from library:', err);
        throw err;
    }
}

/**
 * Check if a story is in the library
 * @param {string} spreadCode
 * @returns {Promise<boolean>}
 */
async function isInLibrary(spreadCode) {
    try {
        const database = await openDatabase();
        const tx = database.transaction(LIBRARY_STORE, 'readonly');
        const store = tx.objectStore(LIBRARY_STORE);
        
        return new Promise((resolve, reject) => {
            const request = store.get(spreadCode);
            request.onsuccess = () => resolve(!!request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        return false;
    }
}

/**
 * Get a story from the library
 * @param {string} spreadCode
 * @returns {Promise<Object|null>}
 */
async function getLibraryStory(spreadCode) {
    try {
        const database = await openDatabase();
        const tx = database.transaction(LIBRARY_STORE, 'readonly');
        const store = tx.objectStore(LIBRARY_STORE);
        
        return new Promise((resolve, reject) => {
            const request = store.get(spreadCode);
            request.onsuccess = () => {
                resolve(request.result?.data || null);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        return null;
    }
}

/**
 * Get all library story codes
 * @returns {Promise<Set<string>>}
 */
async function getLibraryStoryCodes() {
    try {
        const database = await openDatabase();
        const tx = database.transaction(LIBRARY_STORE, 'readonly');
        const store = tx.objectStore(LIBRARY_STORE);
        
        return new Promise((resolve, reject) => {
            const codes = new Set();
            const request = store.openCursor();
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    codes.add(cursor.key);
                    cursor.continue();
                } else {
                    resolve(codes);
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        return new Set();
    }
}

/**
 * Get all library stories
 * @returns {Promise<Object[]>}
 */
async function getAllLibraryStories() {
    try {
        const database = await openDatabase();
        const tx = database.transaction(LIBRARY_STORE, 'readonly');
        const store = tx.objectStore(LIBRARY_STORE);
        
        return new Promise((resolve, reject) => {
            const stories = [];
            const request = store.openCursor();
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    stories.push(cursor.value.data);
                    cursor.continue();
                } else {
                    resolve(stories);
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        return [];
    }
}

/**
 * Clear the entire library
 */
async function clearLibrary() {
    try {
        const database = await openDatabase();
        const tx = database.transaction(LIBRARY_STORE, 'readwrite');
        const store = tx.objectStore(LIBRARY_STORE);
        store.clear();
        
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        
    } catch (err) {
        console.error('[Offline] Failed to clear library:', err);
        throw err;
    }
}

/**
 * Get library statistics
 * @returns {Promise<{count: number, sizeEstimate: number}>}
 */
async function getLibraryStats() {
    try {
        const database = await openDatabase();
        const tx = database.transaction(LIBRARY_STORE, 'readonly');
        const store = tx.objectStore(LIBRARY_STORE);
        
        return new Promise((resolve, reject) => {
            const countRequest = store.count();
            countRequest.onsuccess = () => {
                const count = countRequest.result;
                const sizeEstimate = count * 105 * 1024;
                resolve({ count, sizeEstimate });
            };
            countRequest.onerror = () => reject(countRequest.error);
        });
    } catch (err) {
        return { count: 0, sizeEstimate: 0 };
    }
}

// ============================================================================
// Combined Offline Access
// ============================================================================

/**
 * Get a story from any offline source (library first, then cache)
 * @param {string} spreadCode
 * @returns {Promise<Object|null>}
 */
async function getOfflineStory(spreadCode) {
    // Check library first (higher priority)
    const libraryStory = await getLibraryStory(spreadCode);
    if (libraryStory) return libraryStory;
    
    // Fall back to cache
    return getCachedStory(spreadCode);
}

/**
 * Get all offline-available story codes (library + cache)
 * @returns {Promise<Set<string>>}
 */
async function getAllOfflineStoryCodes() {
    const [libraryCodes, cacheCodes] = await Promise.all([
        getLibraryStoryCodes(),
        getCachedStoryCodes()
    ]);
    
    return new Set([...libraryCodes, ...cacheCodes]);
}

/**
 * Check if device is offline
 * @returns {boolean}
 */
function isOffline() {
    return !navigator.onLine;
}

// ============================================================================
// Offline Detection & Banner
// ============================================================================

let offlineListeners = [];

/**
 * Initialize offline detection
 */
function initOfflineDetection() {
    // Set initial state
    updateOfflineUI(isOffline());
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
        console.log('[Offline] Device is online');
        updateOfflineUI(false);
        notifyOfflineListeners(false);
    });
    
    window.addEventListener('offline', () => {
        console.log('[Offline] Device is offline');
        updateOfflineUI(true);
        notifyOfflineListeners(true);
    });
}

/**
 * Update offline UI (banner, body class)
 */
async function updateOfflineUI(offline) {
    const banner = document.getElementById('offlineBanner');
    const countEl = document.getElementById('offlineCount');
    
    if (offline) {
        document.body.classList.add('is-offline');
        
        // Get count of available offline stories
        const offlineCodes = await getAllOfflineStoryCodes();
        const count = offlineCodes.size;
        
        if (countEl) {
            countEl.textContent = `· ${count} ${count === 1 ? 'story' : 'stories'} available`;
        }
        
        if (banner) {
            banner.style.display = 'flex';
            requestAnimationFrame(() => {
                banner.classList.add('visible');
            });
        }
    } else {
        document.body.classList.remove('is-offline');
        
        if (banner) {
            banner.classList.remove('visible');
            setTimeout(() => {
                banner.style.display = 'none';
            }, 300);
        }
    }
}

/**
 * Register a listener for offline state changes
 * @param {Function} callback - Called with (isOffline: boolean)
 */
function onOfflineChange(callback) {
    offlineListeners.push(callback);
}

/**
 * Notify all offline listeners
 */
function notifyOfflineListeners(offline) {
    offlineListeners.forEach(cb => {
        try {
            cb(offline);
        } catch (err) {
            console.error('[Offline] Listener error:', err);
        }
    });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format bytes to human-readable string
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ============================================================================
// Export
// ============================================================================

window.GraceOffline = {
    // Database
    openDatabase,
    
    // Cache (automatic)
    cacheStory,
    getCachedStory,
    getCachedStoryCodes,
    getCacheStats,
    clearCache,
    
    // Library (intentional)
    saveToLibrary,
    removeFromLibrary,
    isInLibrary,
    getLibraryStory,
    getLibraryStoryCodes,
    getAllLibraryStories,
    getLibraryStats,
    clearLibrary,
    
    // Combined
    getOfflineStory,
    getAllOfflineStoryCodes,
    isOffline,
    
    // Offline detection
    initOfflineDetection,
    updateOfflineUI,
    onOfflineChange,
    
    // Utility
    formatBytes
};

// Auto-initialize offline detection when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOfflineDetection);
} else {
    initOfflineDetection();
}

