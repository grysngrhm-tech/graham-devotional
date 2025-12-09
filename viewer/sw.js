/**
 * The Graham Bible - Service Worker
 * Provides offline caching with smart caching strategies
 */

const CACHE_NAME = 'graham-bible-v19'; // Fix missing script tag
const IMAGE_CACHE = 'graham-bible-images-v1';

// App shell files to cache on install
const APP_SHELL = [
    './',
    './index.html',
    './admin.html',
    './offline.html',
    './privacy.html',
    './terms.html',
    './404.html',
    './styles.css',
    './app.js',
    './offline.js',
    './router.js',
    './auth.js',
    './settings.js',
    './config.js',
    './manifest.json',
    './lib/supabase.min.js',
    './data/all-spreads.json?v=3',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-180.png',
    './icons/favicon-32.png'
];

// Google Fonts to cache
const FONT_CACHE = 'grace-bible-fonts-v1';

// Supabase storage domain for image caching
const SUPABASE_STORAGE_HOST = 'zekbemqgvupzmukpntog.supabase.co';

// Install event - cache app shell
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching app shell');
                return cache.addAll(APP_SHELL);
            })
            .then(() => {
                console.log('[SW] App shell cached, skipping waiting');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Failed to cache app shell:', error);
            })
    );
});

// Activate event - clean up old caches and claim clients
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    const validCaches = [CACHE_NAME, FONT_CACHE, IMAGE_CACHE];
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => {
                        // Delete old versions of our caches
                        return (name.startsWith('grace-bible-') || name.startsWith('graham-bible-')) && 
                               !validCaches.includes(name);
                    })
                    .map((name) => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => {
            console.log('[SW] Claiming clients');
            return self.clients.claim();
        })
    );
});

// Fetch event - smart caching strategies
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') return;
    
    // Handle Supabase storage images - cache first for performance
    if (url.hostname === SUPABASE_STORAGE_HOST && url.pathname.includes('/storage/')) {
        event.respondWith(handleImageRequest(request));
        return;
    }
    
    // Skip other Supabase API calls - always network
    if (url.hostname.includes('supabase')) return;
    
    // Skip n8n webhook calls - always network
    if (url.hostname.includes('n8n')) return;
    
    // Handle Google Fonts - cache first, then network
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(handleFontRequest(request));
        return;
    }
    
    // Skip other cross-origin requests
    if (!url.href.startsWith(self.location.origin)) return;
    
    // HTML pages - network first, fall back to cache, then offline page
    // For SPA, always serve index.html for navigation requests
    if (request.headers.get('accept')?.includes('text/html') || 
        url.pathname.endsWith('.html') || 
        url.pathname.endsWith('/')) {
        event.respondWith(handleHtmlRequest(request));
        return;
    }
    
    // Static assets (CSS, JS, images) - cache first, then network
    event.respondWith(handleStaticRequest(request));
});

// Network-first strategy for HTML pages
async function handleHtmlRequest(request) {
    try {
        // Try network first for fresh content
        const networkResponse = await fetch(request);
        
        // Cache the response if successful
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        // Network failed, try cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // For SPA navigation, try serving index.html
        const indexResponse = await caches.match('./index.html');
        if (indexResponse) {
            return indexResponse;
        }
        
        // No cache, return offline page
        const offlineResponse = await caches.match('./offline.html');
        if (offlineResponse) {
            return offlineResponse;
        }
        
        // Last resort - simple offline message
        return new Response(
            '<html><body><h1>Offline</h1><p>The Graham Bible is not available offline.</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
        );
    }
}

// Cache-first strategy for static assets
async function handleStaticRequest(request) {
    // Check cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    
    // Not in cache, fetch from network
    try {
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        // Network failed and not in cache
        console.error('[SW] Failed to fetch:', request.url);
        return new Response('Resource not available offline', { status: 503 });
    }
}

// Cache-first strategy for Supabase storage images
async function handleImageRequest(request) {
    // Check image cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    
    // Fetch from network
    try {
        const networkResponse = await fetch(request);
        
        // Cache successful image responses
        if (networkResponse.ok) {
            const cache = await caches.open(IMAGE_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('[SW] Failed to fetch image:', request.url);
        // Return a placeholder or error response
        return new Response('Image not available offline', { 
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

// Cache-first strategy for Google Fonts with dedicated cache
async function handleFontRequest(request) {
    // Check font cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    
    // Fetch from network
    try {
        const networkResponse = await fetch(request);
        
        // Cache font files (not the CSS which might change)
        if (networkResponse.ok) {
            const cache = await caches.open(FONT_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('[SW] Failed to fetch font:', request.url);
        return new Response('Font not available', { status: 503 });
    }
}

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
