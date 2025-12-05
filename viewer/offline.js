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
const DB_VERSION = 2; // Bumped for story-list store
const CACHE_STORE = 'story-cache';
const LIBRARY_STORE = 'library';
const STORY_LIST_STORE = 'story-list'; // New: cached story list for instant home page
const MAX_CACHE_SIZE = 100; // LRU eviction after 100 stories
const STORY_LIST_FRESHNESS_MS = 5 * 60 * 1000; // 5 minutes - consider cached list "fresh"

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
            
            // Story list store (cached home page data for instant loading)
            if (!database.objectStoreNames.contains(STORY_LIST_STORE)) {
                database.createObjectStore(STORY_LIST_STORE, { keyPath: 'id' });
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
// Story List Cache (For Instant Home Page Loading)
// ============================================================================

/**
 * Save the full story list to cache
 * @param {Object[]} stories - Array of story metadata objects
 */
async function saveStoryList(stories) {
    if (!stories?.length) return;
    
    try {
        const database = await openDatabase();
        const tx = database.transaction(STORY_LIST_STORE, 'readwrite');
        const store = tx.objectStore(STORY_LIST_STORE);
        
        const entry = {
            id: 'main', // Single entry for the story list
            stories: stories,
            cached_at: Date.now()
        };
        
        store.put(entry);
        
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        
        console.log('[Offline] Story list cached:', stories.length, 'stories');
    } catch (err) {
        console.error('[Offline] Failed to cache story list:', err);
    }
}

/**
 * Get the cached story list
 * @returns {Promise<{stories: Object[], cached_at: number, isFresh: boolean}|null>}
 */
async function getStoryList() {
    try {
        const database = await openDatabase();
        const tx = database.transaction(STORY_LIST_STORE, 'readonly');
        const store = tx.objectStore(STORY_LIST_STORE);
        
        return new Promise((resolve, reject) => {
            const request = store.get('main');
            request.onsuccess = () => {
                const entry = request.result;
                if (entry) {
                    const age = Date.now() - entry.cached_at;
                    const isFresh = age < STORY_LIST_FRESHNESS_MS;
                    resolve({
                        stories: entry.stories,
                        cached_at: entry.cached_at,
                        isFresh: isFresh
                    });
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.error('[Offline] Failed to get cached story list:', err);
        return null;
    }
}

/**
 * Check if story list cache is fresh (< 5 minutes old)
 * @returns {Promise<boolean>}
 */
async function isStoryListFresh() {
    const cached = await getStoryList();
    return cached?.isFresh || false;
}

/**
 * Clear the story list cache
 */
async function clearStoryListCache() {
    try {
        const database = await openDatabase();
        const tx = database.transaction(STORY_LIST_STORE, 'readwrite');
        const store = tx.objectStore(STORY_LIST_STORE);
        store.clear();
        
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.error('[Offline] Failed to clear story list cache:', err);
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
// Download Entire Bible Feature
// ============================================================================

/**
 * Download the entire Bible for offline use
 * Downloads all story data and only the PRIMARY image per story (not all 4)
 * @param {Function} progressCallback - Called with {current, total, message, phase}
 * @param {Map} userPrimaryImages - Map of spread_code -> image_slot for user's selections
 * @returns {Promise<{success: boolean, storiesDownloaded: number, imagesDownloaded: number, errors: number}>}
 */
async function downloadEntireBible(progressCallback, userPrimaryImages = new Map()) {
    const result = {
        success: false,
        storiesDownloaded: 0,
        imagesDownloaded: 0,
        errors: 0
    };
    
    try {
        // Phase 1: Fetch all stories from Supabase
        progressCallback?.({ current: 0, total: 100, message: 'Fetching stories...', phase: 'fetch' });
        
        const supabase = window.supabaseClient;
        if (!supabase) {
            throw new Error('Supabase not initialized');
        }
        
        const { data: stories, error } = await supabase
            .from('grahams_devotional_spreads')
            .select('*');
        
        if (error) throw error;
        if (!stories?.length) throw new Error('No stories returned');
        
        const total = stories.length;
        console.log('[Offline] Downloading', total, 'stories');
        
        // Phase 2: Save stories to library and cache images
        const database = await openDatabase();
        const imageCache = await caches.open('graham-bible-images-v1');
        
        for (let i = 0; i < stories.length; i++) {
            const story = stories[i];
            const progress = Math.round((i / total) * 100);
            
            progressCallback?.({
                current: i + 1,
                total: total,
                message: `Downloading ${i + 1}/${total}: ${story.title || story.spread_code}`,
                phase: 'download'
            });
            
            try {
                // Save story data to library
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
                
                result.storiesDownloaded++;
                
                // Determine primary image URL (user's selection > global default > first)
                let primaryImageUrl = null;
                const userSlot = userPrimaryImages.get(story.spread_code);
                if (userSlot) {
                    primaryImageUrl = story[`image_url_${userSlot}`];
                }
                if (!primaryImageUrl) {
                    primaryImageUrl = story.image_url || story.image_url_1;
                }
                
                // Cache the primary image
                if (primaryImageUrl) {
                    try {
                        // Check if already cached
                        const cachedResponse = await imageCache.match(primaryImageUrl);
                        if (!cachedResponse) {
                            const imageResponse = await fetch(primaryImageUrl);
                            if (imageResponse.ok) {
                                await imageCache.put(primaryImageUrl, imageResponse);
                                result.imagesDownloaded++;
                            }
                        } else {
                            result.imagesDownloaded++; // Already cached
                        }
                    } catch (imgErr) {
                        console.warn('[Offline] Failed to cache image for', story.spread_code, imgErr);
                        // Don't count as error - story data is still saved
                    }
                }
                
            } catch (storyErr) {
                console.error('[Offline] Failed to save story', story.spread_code, storyErr);
                result.errors++;
            }
        }
        
        // Phase 3: Complete
        progressCallback?.({
            current: total,
            total: total,
            message: `Downloaded ${result.storiesDownloaded} stories, ${result.imagesDownloaded} images`,
            phase: 'complete'
        });
        
        result.success = result.storiesDownloaded > 0;
        console.log('[Offline] Download complete:', result);
        
    } catch (err) {
        console.error('[Offline] Download failed:', err);
        progressCallback?.({
            current: 0,
            total: 0,
            message: `Download failed: ${err.message}`,
            phase: 'error'
        });
    }
    
    return result;
}

/**
 * Get download size estimate
 * @returns {{stories: number, estimatedMB: number}}
 */
async function getDownloadEstimate() {
    try {
        const supabase = window.supabaseClient;
        if (!supabase) return { stories: 500, estimatedMB: 625 }; // Default estimate
        
        const { count } = await supabase
            .from('grahams_devotional_spreads')
            .select('*', { count: 'exact', head: true });
        
        // Estimate: ~5KB per story data + ~1.25MB per image = ~1.25MB per story
        const stories = count || 500;
        const estimatedMB = Math.round(stories * 1.25);
        
        return { stories, estimatedMB };
    } catch (err) {
        return { stories: 500, estimatedMB: 625 };
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
    
    // Story list cache (for instant home page)
    saveStoryList,
    getStoryList,
    isStoryListFresh,
    clearStoryListCache,
    
    // Download entire Bible
    downloadEntireBible,
    getDownloadEstimate,
    
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

