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
 * Skips if story is already in user's library (prevents duplicates)
 * @param {Object} story - Full story object from Supabase
 */
async function cacheStory(story) {
    if (!story?.spread_code) return;
    
    try {
        // Skip if already in library (prevents duplicate storage)
        const inLibrary = await isInLibrary(story.spread_code);
        if (inLibrary) {
            return;
        }
        
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
        
        // Check storage limit and cleanup if needed
        await checkStorageLimitAndCleanup();
        
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
                // Estimate ~1.1MB per story (100KB data + 1MB image)
                const sizeEstimate = count * 1.1 * 1024 * 1024;
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
 * Also removes from automatic cache to prevent duplicate storage
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
        
        // Remove from cache if exists (prevent duplicate storage)
        await removeFromCacheIfExists(story.spread_code);
        
    } catch (err) {
        console.error('[Offline] Failed to save to library:', err);
        throw err;
    }
}

/**
 * Remove a story from cache if it exists (for deduplication)
 * @param {string} spreadCode
 */
async function removeFromCacheIfExists(spreadCode) {
    try {
        const database = await openDatabase();
        const tx = database.transaction(CACHE_STORE, 'readwrite');
        const store = tx.objectStore(CACHE_STORE);
        store.delete(spreadCode);
        
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        // Non-critical - ignore errors
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
                // Estimate ~1.1MB per story (100KB data + 1MB image)
                const sizeEstimate = count * 1.1 * 1024 * 1024;
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
// Download progress storage key
const DOWNLOAD_PROGRESS_KEY = 'graham-download-progress';

/**
 * Get saved download progress (for resume)
 * @returns {{completed: Set<string>, startedAt: number, total: number}|null}
 */
function getSavedDownloadProgress() {
    try {
        const saved = localStorage.getItem(DOWNLOAD_PROGRESS_KEY);
        if (!saved) return null;
        
        const data = JSON.parse(saved);
        // Check if progress is less than 24 hours old
        if (Date.now() - data.startedAt > 24 * 60 * 60 * 1000) {
            clearDownloadProgress();
            return null;
        }
        
        return {
            completed: new Set(data.completed || []),
            startedAt: data.startedAt,
            total: data.total
        };
    } catch {
        return null;
    }
}

/**
 * Save download progress for resume
 */
function saveDownloadProgress(completed, total) {
    try {
        localStorage.setItem(DOWNLOAD_PROGRESS_KEY, JSON.stringify({
            completed: Array.from(completed),
            startedAt: Date.now(),
            total
        }));
    } catch {
        // localStorage might be full or unavailable
    }
}

/**
 * Clear download progress (on completion or cancel)
 */
function clearDownloadProgress() {
    localStorage.removeItem(DOWNLOAD_PROGRESS_KEY);
}

/**
 * Check if there's a download that can be resumed
 * @returns {{canResume: boolean, completed: number, total: number}}
 */
function checkResumableDownload() {
    const progress = getSavedDownloadProgress();
    if (!progress) {
        return { canResume: false, completed: 0, total: 0 };
    }
    return {
        canResume: progress.completed.size > 0 && progress.completed.size < progress.total,
        completed: progress.completed.size,
        total: progress.total
    };
}

async function downloadEntireBible(progressCallback, userPrimaryImages = new Map(), resumePrevious = true) {
    const result = {
        success: false,
        storiesDownloaded: 0,
        imagesDownloaded: 0,
        errors: 0,
        skipped: 0
    };
    
    // Check for resumable progress
    let completedSpreadCodes = new Set();
    if (resumePrevious) {
        const savedProgress = getSavedDownloadProgress();
        if (savedProgress) {
            completedSpreadCodes = savedProgress.completed;
            console.log('[Offline] Resuming download, skipping', completedSpreadCodes.size, 'already completed stories');
        }
    }
    
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
            
            // Skip already completed stories (for resume)
            if (completedSpreadCodes.has(story.spread_code)) {
                result.skipped++;
                continue;
            }
            
            const processed = i + 1;
            
            progressCallback?.({
                current: processed,
                total: total,
                message: `Downloading ${processed}/${total}: ${story.title || story.spread_code}`,
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
                    // Use slot-based global default
                    const globalSlot = story.primary_slot || 1;
                    primaryImageUrl = story[`image_url_${globalSlot}`] || story.image_url_1;
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
                
                // Mark as completed and save progress periodically (every 10 stories)
                completedSpreadCodes.add(story.spread_code);
                if (processed % 10 === 0) {
                    saveDownloadProgress(completedSpreadCodes, total);
                }
                
            } catch (storyErr) {
                console.error('[Offline] Failed to save story', story.spread_code, storyErr);
                result.errors++;
            }
        }
        
        // Phase 3: Complete - clear progress since we're done
        clearDownloadProgress();
        
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
        // Save progress on error so user can resume
        if (completedSpreadCodes.size > 0) {
            saveDownloadProgress(completedSpreadCodes, result.storiesDownloaded + result.errors);
        }
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
 * Updated estimate: ~100KB data + ~1MB image = ~1.1MB per story
 * @returns {{stories: number, estimatedMB: number}}
 */
async function getDownloadEstimate() {
    try {
        const supabase = window.supabaseClient;
        if (!supabase) return { stories: 500, estimatedMB: 550 }; // Default estimate
        
        const { count } = await supabase
            .from('grahams_devotional_spreads')
            .select('*', { count: 'exact', head: true });
        
        // Estimate: ~100KB per story data + ~1MB per primary image = ~1.1MB per story
        const stories = count || 500;
        const estimatedMB = Math.round(stories * 1.1);
        
        return { stories, estimatedMB };
    } catch (err) {
        return { stories: 500, estimatedMB: 550 };
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
// Storage Limit Management
// ============================================================================

// Storage limit presets in MB (50 MB increments)
const STORAGE_PRESETS = [50, 100, 150, 300, 450, 600, 750];
const DEFAULT_STORAGE_LIMIT_MB = 150;
const STORAGE_LIMIT_KEY = 'graham-storage-limit-mb';

/**
 * Get the current storage limit in MB
 * @returns {number}
 */
function getStorageLimitMB() {
    try {
        const stored = localStorage.getItem(STORAGE_LIMIT_KEY);
        if (stored) {
            const limit = parseInt(stored, 10);
            if (STORAGE_PRESETS.includes(limit)) {
                return limit;
            }
        }
    } catch (err) {
        // localStorage might be unavailable
    }
    return DEFAULT_STORAGE_LIMIT_MB;
}

/**
 * Set the storage limit in MB
 * @param {number} limitMB - Must be one of STORAGE_PRESETS
 */
function setStorageLimitMB(limitMB) {
    if (!STORAGE_PRESETS.includes(limitMB)) {
        console.warn('[Offline] Invalid storage limit:', limitMB);
        return;
    }
    try {
        localStorage.setItem(STORAGE_LIMIT_KEY, limitMB.toString());
        console.log('[Offline] Storage limit set to', limitMB, 'MB');
    } catch (err) {
        console.error('[Offline] Failed to save storage limit:', err);
    }
}

/**
 * Get total app storage usage (cache + library + images)
 * @returns {Promise<{totalBytes: number, cacheBytes: number, libraryBytes: number, imageBytes: number}>}
 */
async function getAppStorageUsage() {
    try {
        const [cacheStats, libraryStats] = await Promise.all([
            getCacheStats(),
            getLibraryStats()
        ]);
        
        // Estimate ~1.1MB per story (100KB data + 1MB image)
        const BYTES_PER_STORY = 1.1 * 1024 * 1024;
        
        const cacheBytes = cacheStats.count * BYTES_PER_STORY;
        const libraryBytes = libraryStats.count * BYTES_PER_STORY;
        const imageBytes = 0; // Images counted in per-story estimate
        
        return {
            totalBytes: cacheBytes + libraryBytes,
            cacheBytes,
            libraryBytes,
            imageBytes,
            cacheCount: cacheStats.count,
            libraryCount: libraryStats.count
        };
    } catch (err) {
        console.error('[Offline] Failed to get storage usage:', err);
        return { totalBytes: 0, cacheBytes: 0, libraryBytes: 0, imageBytes: 0, cacheCount: 0, libraryCount: 0 };
    }
}

/**
 * Check if storage is approaching limit and cleanup if needed
 * Called automatically after caching stories
 */
async function checkStorageLimitAndCleanup() {
    try {
        const limitMB = getStorageLimitMB();
        const limitBytes = limitMB * 1024 * 1024;
        const usage = await getAppStorageUsage();
        
        // Check if over 90% of limit
        if (usage.totalBytes > limitBytes * 0.9) {
            console.log('[Offline] Storage approaching limit, cleaning up...');
            await smartCleanup(usage.totalBytes - (limitBytes * 0.7)); // Free up to 70%
        }
    } catch (err) {
        console.error('[Offline] Storage limit check failed:', err);
    }
}

/**
 * Smart cleanup - removes least important data first
 * Priority: 1. Old cache entries (LRU), 2. Story list cache
 * Never touches Library (user's intentional saves)
 * @param {number} targetBytesToFree - How many bytes to free up
 * @returns {Promise<{freed: number, itemsDeleted: number}>}
 */
async function smartCleanup(targetBytesToFree) {
    let totalFreed = 0;
    let itemsDeleted = 0;
    const BYTES_PER_STORY = 1.1 * 1024 * 1024;
    
    try {
        const database = await openDatabase();
        
        // Phase 1: Delete oldest cache entries (LRU)
        const tx = database.transaction(CACHE_STORE, 'readwrite');
        const store = tx.objectStore(CACHE_STORE);
        const index = store.index('last_viewed');
        
        await new Promise((resolve, reject) => {
            const cursorRequest = index.openCursor();
            cursorRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && totalFreed < targetBytesToFree) {
                    store.delete(cursor.primaryKey);
                    totalFreed += BYTES_PER_STORY;
                    itemsDeleted++;
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            cursorRequest.onerror = () => reject(cursorRequest.error);
        });
        
        // Phase 2: If still not enough, clear story list cache
        if (totalFreed < targetBytesToFree) {
            await clearStoryListCache();
            totalFreed += 2 * 1024 * 1024; // Estimate 2MB for story list
        }
        
        console.log('[Offline] Cleanup freed', formatBytes(totalFreed), '- deleted', itemsDeleted, 'cache entries');
        
        // Notify user
        if (itemsDeleted > 0 && typeof showToast === 'function') {
            showToast(`Cleared ${itemsDeleted} cached stories to free space`);
        }
        
        return { freed: totalFreed, itemsDeleted };
    } catch (err) {
        console.error('[Offline] Smart cleanup failed:', err);
        return { freed: 0, itemsDeleted: 0 };
    }
}

/**
 * Check if there's enough storage space for a download
 * @param {number} requiredMB - Required space in MB
 * @returns {Promise<{hasSpace: boolean, availableMB: number, requiredMB: number, needsMoreMB: number}>}
 */
async function checkStorageAvailability(requiredMB) {
    const limitMB = getStorageLimitMB();
    const usage = await getAppStorageUsage();
    const usedMB = Math.round(usage.totalBytes / (1024 * 1024));
    const availableMB = limitMB - usedMB;
    const hasSpace = availableMB >= requiredMB;
    
    return {
        hasSpace,
        availableMB,
        requiredMB,
        needsMoreMB: hasSpace ? 0 : requiredMB - availableMB,
        currentLimitMB: limitMB
    };
}

// ============================================================================
// Smart Prefetch System
// ============================================================================

// Track pending prefetch operations to avoid duplicates
const pendingPrefetch = new Set();

/**
 * Prefetch adjacent stories for faster navigation
 * Uses requestIdleCallback for low-priority fetching
 * @param {string} currentSpreadCode - Current story being viewed
 * @param {Array} filteredStories - Array of filtered story objects
 * @param {number} range - Number of adjacent stories to prefetch (default: 2)
 */
async function prefetchAdjacentStories(currentSpreadCode, filteredStories, range = 2) {
    // Check if prefetch is enabled in settings
    if (window.GraceSettings?.getSetting('prefetchEnabled') === false) {
        return;
    }
    
    if (!filteredStories?.length || !currentSpreadCode) return;
    
    // Find current position
    const currentIndex = filteredStories.findIndex(s => s.spread_code === currentSpreadCode);
    if (currentIndex === -1) return;
    
    // Collect spread codes to prefetch (prev and next)
    const toPrefetch = [];
    
    for (let i = 1; i <= range; i++) {
        // Previous stories
        if (currentIndex - i >= 0) {
            toPrefetch.push(filteredStories[currentIndex - i].spread_code);
        }
        // Next stories
        if (currentIndex + i < filteredStories.length) {
            toPrefetch.push(filteredStories[currentIndex + i].spread_code);
        }
    }
    
    // Filter out already cached or pending stories
    const cachedCodes = await getCachedStoryCodes();
    const codesToFetch = toPrefetch.filter(code => 
        !cachedCodes.has(code) && !pendingPrefetch.has(code)
    );
    
    if (codesToFetch.length === 0) return;
    
    console.log('[Offline] Prefetching', codesToFetch.length, 'adjacent stories');
    
    // Use requestIdleCallback for low-priority fetching
    const scheduleIdleTask = window.requestIdleCallback || ((cb) => setTimeout(cb, 100));
    
    for (const spreadCode of codesToFetch) {
        pendingPrefetch.add(spreadCode);
        
        scheduleIdleTask(async () => {
            try {
                await prefetchStory(spreadCode);
            } finally {
                pendingPrefetch.delete(spreadCode);
            }
        }, { timeout: 5000 }); // Max 5 second delay
    }
}

/**
 * Prefetch a single story (data + primary image)
 * Caches both story data and the primary image for instant loading
 * @param {string} spreadCode
 */
async function prefetchStory(spreadCode) {
    // Skip if already cached
    const cached = await getCachedStory(spreadCode);
    if (cached) return;
    
    // Skip if no Supabase client
    const supabase = window.supabaseClient;
    if (!supabase) return;
    
    try {
        const { data: story, error } = await supabase
            .from('grahams_devotional_spreads')
            .select('spread_code, title, testament, book, start_chapter, start_verse, end_chapter, end_verse, kjv_passage_ref, devotional_content, key_verse, key_verse_text, life_application, primary_slot, image_url_1, image_url_2, image_url_3, image_url_4')
            .eq('spread_code', spreadCode)
            .single();
        
        if (error) throw error;
        
        if (story) {
            // Cache story data
            await cacheStory(story);
            
            // Also cache the primary image for instant loading
            await prefetchPrimaryImage(story);
            
            console.log('[Offline] Prefetched:', spreadCode);
        }
    } catch (err) {
        // Silent fail - prefetch is non-critical
        console.warn('[Offline] Prefetch failed for', spreadCode, err.message);
    }
}

/**
 * Prefetch and cache a story's primary image
 * @param {Object} story - Story object with image URLs
 */
async function prefetchPrimaryImage(story) {
    if (!story) return;
    
    try {
        // Determine primary image URL (user selection > global default > slot 1)
        let primaryImageUrl = null;
        
        // Check for user's custom selection
        if (window.GraceAuth?.isAuthenticated()) {
            const userSlot = await window.GraceAuth.getUserPrimaryImage?.(story.spread_code);
            if (userSlot) {
                primaryImageUrl = story[`image_url_${userSlot}`];
            }
        }
        
        // Fall back to global default (primary_slot)
        if (!primaryImageUrl) {
            const globalSlot = story.primary_slot || 1;
            primaryImageUrl = story[`image_url_${globalSlot}`] || story.image_url_1;
        }
        
        if (!primaryImageUrl) return;
        
        // Cache the image using service worker's cache
        const imageCache = await caches.open('graham-bible-images-v1');
        const cachedResponse = await imageCache.match(primaryImageUrl);
        
        if (!cachedResponse) {
            const response = await fetch(primaryImageUrl);
            if (response.ok) {
                await imageCache.put(primaryImageUrl, response);
                console.log('[Offline] Prefetched image for:', story.spread_code);
            }
        }
    } catch (err) {
        // Silent fail - image prefetch is non-critical
        console.warn('[Offline] Image prefetch failed for', story.spread_code, err.message);
    }
}

/**
 * Get prefetch status for debugging
 * @returns {{pending: number, codes: string[]}}
 */
function getPrefetchStatus() {
    return {
        pending: pendingPrefetch.size,
        codes: Array.from(pendingPrefetch)
    };
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
    
    // Download entire Bible (with resume support)
    downloadEntireBible,
    getDownloadEstimate,
    checkResumableDownload,
    clearDownloadProgress,
    
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
    
    // Smart prefetch
    prefetchAdjacentStories,
    prefetchStory,
    prefetchPrimaryImage,
    getPrefetchStatus,
    
    // Storage limit management
    getStorageLimitMB,
    setStorageLimitMB,
    getAppStorageUsage,
    checkStorageAvailability,
    smartCleanup,
    STORAGE_PRESETS,
    
    // Utility
    formatBytes
};

// Auto-initialize offline detection when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOfflineDetection);
} else {
    initOfflineDetection();
}

