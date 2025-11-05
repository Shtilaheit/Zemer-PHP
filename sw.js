/**
 * Service Worker for Metrolist
 * Aggressive caching for blazing-fast performance
 */

const CACHE_NAME = 'metrolist-v1';
const RUNTIME_CACHE = 'metrolist-runtime-v1';

// Files to cache immediately
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/assets/css/material3.css',
    '/assets/js/app.js',
    '/assets/js/debug.js'
];

// API cache duration (in seconds)
const API_CACHE_DURATION = {
    search: 3600,        // 1 hour
    browse: 86400,       // 24 hours
    player: 18000,       // 5 hours
    home: 900,           // 15 minutes
    suggestions: 1800    // 30 minutes
};

// ============================================
// Install Event - Cache static assets
// ============================================

self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Precaching static assets');
                return cache.addAll(PRECACHE_URLS);
            })
            .then(() => self.skipWaiting())
    );
});

// ============================================
// Activate Event - Clean old caches
// ============================================

self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => self.clients.claim())
    );
});

// ============================================
// Fetch Event - Serve from cache or network
// ============================================

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle same-origin requests
    if (url.origin !== location.origin) {
        return;
    }

    // Strategy 1: Cache-first for static assets
    if (isStaticAsset(url.pathname)) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // Strategy 2: Network-first with cache fallback for API requests
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirstWithCache(request));
        return;
    }

    // Strategy 3: Network-first with cache fallback for HTML
    if (request.mode === 'navigate') {
        event.respondWith(networkFirstWithCache(request));
        return;
    }

    // Default: Network only
    event.respondWith(fetch(request));
});

// ============================================
// Caching Strategies
// ============================================

/**
 * Cache-first strategy
 * Perfect for static assets that never change
 */
async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if (cached) {
        return cached;
    }

    const response = await fetch(request);

    // Cache successful responses
    if (response.status === 200) {
        cache.put(request, response.clone());
    }

    return response;
}

/**
 * Network-first with cache fallback
 * Try network first, fall back to cache if offline
 */
async function networkFirstWithCache(request) {
    const cache = await caches.open(RUNTIME_CACHE);

    try {
        const response = await fetch(request);

        // Cache successful responses
        if (response.status === 200) {
            // Determine cache duration based on endpoint
            const cacheDuration = getCacheDuration(request.url);

            if (cacheDuration > 0) {
                // Add expiration header for later validation
                const clonedResponse = response.clone();
                const expiresAt = Date.now() + (cacheDuration * 1000);

                // Store with expiration metadata
                cache.put(request, clonedResponse).then(() => {
                    // Store expiration in separate cache entry
                    const metadataKey = `${request.url}:metadata`;
                    cache.put(metadataKey, new Response(JSON.stringify({ expiresAt })));
                });
            }
        }

        return response;
    } catch (error) {
        // Network failed, try cache
        const cached = await cache.match(request);

        if (cached) {
            // Check if cached response is still valid
            const isValid = await isCacheValid(request.url);

            if (isValid || !navigator.onLine) {
                console.log('[SW] Serving cached response (offline):', request.url);
                return cached;
            }
        }

        // No cache available, return error
        return new Response('Network error', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Check if URL is a static asset
 */
function isStaticAsset(pathname) {
    const staticExtensions = ['.js', '.css', '.woff2', '.woff', '.ttf', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif'];
    return staticExtensions.some(ext => pathname.endsWith(ext));
}

/**
 * Get cache duration for API endpoint
 */
function getCacheDuration(url) {
    if (url.includes('/api/search.php')) return API_CACHE_DURATION.search;
    if (url.includes('/api/browse.php')) return API_CACHE_DURATION.browse;
    if (url.includes('/api/player.php')) return API_CACHE_DURATION.player;
    if (url.includes('/api/home.php')) return API_CACHE_DURATION.home;
    if (url.includes('/api/suggestions.php')) return API_CACHE_DURATION.suggestions;
    return 3600; // Default 1 hour
}

/**
 * Check if cached response is still valid
 */
async function isCacheValid(url) {
    const cache = await caches.open(RUNTIME_CACHE);
    const metadataKey = `${url}:metadata`;
    const metadataResponse = await cache.match(metadataKey);

    if (!metadataResponse) {
        return true; // No expiration data, assume valid
    }

    try {
        const metadata = await metadataResponse.json();
        return Date.now() < metadata.expiresAt;
    } catch {
        return true; // Error parsing metadata, assume valid
    }
}

// ============================================
// Background Sync (future enhancement)
// ============================================

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-queue') {
        event.waitUntil(syncQueue());
    }
});

async function syncQueue() {
    console.log('[SW] Syncing queue...');
    // TODO: Sync play queue when back online
}

// ============================================
// Push Notifications (future enhancement)
// ============================================

self.addEventListener('push', (event) => {
    const data = event.data?.json() || {};

    const options = {
        body: data.body || 'New notification from Metrolist',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        vibrate: [200, 100, 200],
        data: data
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Metrolist', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.openWindow(event.notification.data.url || '/')
    );
});

console.log('[SW] Service Worker loaded');
