/**
 * Metrolist Web App
 * High-performance vanilla JavaScript music streaming app
 * With full player controls and Material 3 design
 */

// ============================================
// 1. App State Management
// ============================================

class AppState {
    constructor() {
        this.currentRoute = '/';
        this.currentSong = null;
        this.queue = [];
        this.queueIndex = 0;
        this.isPlaying = false;
        this.volume = 0.8;
        this.listeners = new Map();
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => callback(data));
        }
    }

    setCurrentSong(song) {
        this.currentSong = song;
        this.emit('songChanged', song);
    }

    setPlaying(isPlaying) {
        this.isPlaying = isPlaying;
        this.emit('playStateChanged', isPlaying);
    }

    setQueue(songs, startIndex = 0) {
        this.queue = songs;
        this.queueIndex = startIndex;
        this.emit('queueChanged', { queue: songs, index: startIndex });
    }
}

const appState = new AppState();

// ============================================
// 2. API Client
// ============================================

class API {
    constructor() {
        this.baseUrl = '/api';
        this.cache = new Map();
    }

    async request(endpoint, params = {}) {
        const url = new URL(`${this.baseUrl}/${endpoint}`, window.location.origin);

        // Add query parameters
        Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined) {
                url.searchParams.append(key, params[key]);
            }
        });

        debug.log(`API Request: ${endpoint}`, params);

        try {
            const response = await fetch(url.toString());

            if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Unknown API error');
            }

            return data;
        } catch (error) {
            debug.error(`API Error: ${endpoint}`, error);
            throw error;
        }
    }

    // Search for music
    async search(query, filter = null) {
        return this.request('search.php', { q: query, filter });
    }

    // Browse content (album, artist, playlist)
    async browse(id) {
        return this.request('browse.php', { id });
    }

    // Get streaming URL
    async getStreamingUrl(videoId) {
        return this.request('player.php', { id: videoId });
    }

    // Get home feed
    async getHome() {
        return this.request('home.php');
    }

    // Get search suggestions
    async getSuggestions(input) {
        return this.request('suggestions.php', { q: input });
    }
}

const api = new API();

// ============================================
// 3. Router
// ============================================

class Router {
    constructor() {
        this.routes = new Map();
        this.currentRoute = null;

        // Handle browser navigation
        window.addEventListener('popstate', () => this.navigate(location.pathname, false));

        // Intercept link clicks
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href]');
            if (link && link.href.startsWith(window.location.origin)) {
                e.preventDefault();
                this.navigate(link.pathname);
            }
        });

        // Handle bottom nav clicks
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const route = '/' + (item.dataset.route || '');
                this.navigate(route);
            });
        });
    }

    register(path, handler) {
        this.routes.set(path, handler);
    }

    async navigate(path, pushState = true) {
        debug.log(`Navigating to: ${path}`);

        // Update browser history
        if (pushState && path !== location.pathname) {
            history.pushState(null, '', path);
        }

        // Update active nav item
        document.querySelectorAll('.nav-item').forEach(item => {
            const route = '/' + (item.dataset.route || '');
            item.classList.toggle('active', route === path || (path === '/' && route === '/home'));
        });

        // Find matching route
        let handler = this.routes.get(path);

        if (!handler) {
            // Try default home route
            handler = this.routes.get('/') || this.routes.get('/home');
        }

        if (handler) {
            this.currentRoute = path;
            appState.currentRoute = path;
            await handler();
        } else {
            debug.warn(`No handler found for route: ${path}`);
            this.show404();
        }
    }

    show404() {
        const content = document.getElementById('main-content');
        content.innerHTML = `
            <div class="container" style="text-align: center; padding-top: 100px;">
                <h1 class="headline-large">404</h1>
                <p class="body-large" style="color: var(--md-sys-color-on-surface-variant);">Page not found</p>
                <button class="btn btn-filled mt-3" onclick="router.navigate('/')">Go Home</button>
            </div>
        `;
    }
}

const router = new Router();

// ============================================
// 4. Music Player (IMPROVED)
// ============================================

class MusicPlayer {
    constructor() {
        this.audio = new Audio();
        this.currentSong = null;
        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 0;

        // Set up audio events
        this.audio.addEventListener('ended', () => this.playNext());
        this.audio.addEventListener('play', () => this.updatePlayState(true));
        this.audio.addEventListener('pause', () => this.updatePlayState(false));
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('loadedmetadata', () => this.onLoadedMetadata());
        this.audio.addEventListener('error', (e) => this.onError(e));

        // Set volume
        this.audio.volume = appState.volume;

        // Listen to state changes
        appState.on('songChanged', (song) => this.loadSong(song));
    }

    async loadSong(song) {
        if (!song || !song.videoId) {
            debug.error('Invalid song data - missing videoId', song);
            this.showError('Cannot play this song - invalid data');
            return;
        }

        debug.log('Loading song:', song);

        this.currentSong = song;
        this.showMiniPlayer(true);

        try {
            // Try to get direct streaming URL first
            const data = await api.getStreamingUrl(song.videoId);

            if (data.streamingUrl) {
                debug.log('Got direct streaming URL');
                this.audio.src = data.streamingUrl;
                this.audio.load();
                this.showMiniPlayer(false);
                await this.play();
                return;
            }
        } catch (error) {
            debug.warn('Direct streaming failed, using YouTube embed:', error.message);
        }

        // Fallback to YouTube IFrame embed
        this.loadYouTubeEmbed(song);
    }

    loadYouTubeEmbed(song) {
        debug.log('Loading YouTube embed for:', song.videoId);

        // Create YouTube embed URL
        const embedUrl = `https://www.youtube.com/embed/${song.videoId}?autoplay=1&enablejsapi=1&origin=${window.location.origin}`;

        // Show mini player with embed message
        this.showMiniPlayer(false, true);
        this.isPlaying = true;
        appState.setPlaying(true);

        // Store embed URL for full player
        this.embedUrl = embedUrl;

        debug.log('YouTube embed ready. Click mini player to open full player.');
    }

    async play() {
        try {
            await this.audio.play();
            this.isPlaying = true;
            appState.setPlaying(true);
            debug.log('Playing:', this.currentSong?.title);
        } catch (error) {
            debug.error('Play failed:', error);
            this.showError('Playback failed: ' + error.message);
        }
    }

    pause() {
        this.audio.pause();
        this.isPlaying = false;
        appState.setPlaying(false);
        debug.log('Paused');
    }

    toggle() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    seek(percent) {
        if (this.audio.duration) {
            this.audio.currentTime = (percent / 100) * this.audio.duration;
        }
    }

    setVolume(volume) {
        this.audio.volume = volume;
        appState.volume = volume;
        this.updateVolumeUI();
    }

    playNext() {
        const queue = appState.queue;
        if (queue.length === 0) {
            debug.log('No queue, stopping');
            return;
        }

        appState.queueIndex = (appState.queueIndex + 1) % queue.length;
        const nextSong = queue[appState.queueIndex];

        if (nextSong) {
            debug.log('Playing next song from queue');
            appState.setCurrentSong(nextSong);
        }
    }

    playPrevious() {
        const queue = appState.queue;
        if (queue.length === 0) return;

        appState.queueIndex = appState.queueIndex > 0
            ? appState.queueIndex - 1
            : queue.length - 1;

        const prevSong = queue[appState.queueIndex];
        if (prevSong) {
            debug.log('Playing previous song from queue');
            appState.setCurrentSong(prevSong);
        }
    }

    updatePlayState(isPlaying) {
        this.isPlaying = isPlaying;

        const playButtons = document.querySelectorAll('.player-play-btn');
        playButtons.forEach(btn => {
            btn.innerHTML = isPlaying
                ? '<span style="font-size: 32px;">⏸</span>'
                : '<span style="font-size: 32px;">▶</span>';
        });
    }

    updateProgress() {
        this.currentTime = this.audio.currentTime;
        this.duration = this.audio.duration || 0;

        const progressBar = document.querySelector('.player-progress-filled');
        if (progressBar && this.duration) {
            const percent = (this.currentTime / this.duration) * 100;
            progressBar.style.width = `${percent}%`;
        }

        // Update time display
        const currentTimeEl = document.querySelector('.player-current-time');
        const durationEl = document.querySelector('.player-duration');

        if (currentTimeEl) {
            currentTimeEl.textContent = this.formatTime(this.currentTime);
        }
        if (durationEl) {
            durationEl.textContent = this.formatTime(this.duration);
        }
    }

    updateVolumeUI() {
        const volumeBar = document.querySelector('.player-volume-filled');
        if (volumeBar) {
            volumeBar.style.width = `${this.audio.volume * 100}%`;
        }
    }

    formatTime(seconds) {
        if (!seconds || !isFinite(seconds)) return '0:00';

        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    onLoadedMetadata() {
        this.duration = this.audio.duration;
        debug.log('Audio loaded, duration:', this.duration);
        this.updateProgress();
    }

    onError(e) {
        debug.error('Audio error:', e);
        this.showError('Playback error occurred');
    }

    showError(message) {
        const miniPlayer = document.getElementById('mini-player');
        if (!miniPlayer) return;

        miniPlayer.innerHTML = `
            <div style="padding: 16px; color: var(--md-sys-color-error); text-align: center;">
                <p class="body-medium">${message}</p>
            </div>
        `;

        setTimeout(() => {
            miniPlayer.classList.remove('active');
        }, 5000);
    }

    showMiniPlayer(loading = false, isEmbed = false) {
        const miniPlayer = document.getElementById('mini-player');
        if (!miniPlayer) return;

        miniPlayer.classList.add('active');

        if (loading) {
            miniPlayer.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; width: 100%; padding: 16px;">
                    <p class="body-medium" style="color: var(--md-sys-color-on-surface-variant);">Loading...</p>
                </div>
            `;
            return;
        }

        const song = this.currentSong;
        if (!song) return;

        // Add click handler to open full player
        miniPlayer.onclick = () => this.showFullPlayer();
        miniPlayer.style.cursor = 'pointer';

        const embedMessage = isEmbed ? `
            <div style="text-align: center; margin-top: 8px; padding: 8px; background: var(--md-sys-color-primary-container); border-radius: 8px;">
                <p class="body-small" style="color: var(--md-sys-color-on-primary-container);">
                    🎵 Playing via YouTube · Tap to expand
                </p>
            </div>
        ` : '';

        miniPlayer.innerHTML = `
            <div class="player-content">
                <div class="player-info">
                    <img src="${song.thumbnail || '/assets/icons/default-album.svg'}"
                         class="player-thumbnail"
                         alt="${song.title}">
                    <div class="player-text">
                        <div class="player-title text-truncate">${escapeHtml(song.title || 'Unknown')}</div>
                        <div class="player-artist text-truncate">${escapeHtml(song.artist || 'Unknown Artist')}</div>
                    </div>
                </div>

                <div class="player-controls" onclick="event.stopPropagation()">
                    <button class="player-btn" onclick="player.playPrevious()" title="Previous">
                        <span style="font-size: 24px;">⏮</span>
                    </button>

                    <button class="player-btn player-play-btn" onclick="player.toggle()" title="Play/Pause">
                        <span style="font-size: 32px;">${this.isPlaying ? '⏸' : '▶'}</span>
                    </button>

                    <button class="player-btn" onclick="player.playNext()" title="Next">
                        <span style="font-size: 24px;">⏭</span>
                    </button>

                    <button class="player-btn" onclick="player.showFullPlayer()" title="Expand Player">
                        <span style="font-size: 24px;">⬆️</span>
                    </button>
                </div>

                ${embedMessage}
            </div>
        `;

        // Update initial state if not using embed
        if (!isEmbed) {
            this.updateProgress();
        }
    }

    showFullPlayer() {
        const song = this.currentSong;
        if (!song) return;

        debug.log('Opening full player');

        // Create full player modal
        const modal = document.createElement('div');
        modal.id = 'full-player-modal';
        modal.className = 'full-player-modal';
        modal.innerHTML = `
            <div class="full-player-content">
                <div class="full-player-header">
                    <button class="full-player-close" onclick="player.closeFullPlayer()">
                        <span style="font-size: 32px;">⬇️</span>
                    </button>
                    <h2 class="title-medium">Now Playing</h2>
                    <div style="width: 48px;"></div>
                </div>

                <div class="full-player-artwork">
                    <img src="${song.thumbnail || '/assets/icons/default-album.svg'}"
                         alt="${escapeHtml(song.title)}"
                         style="width: 100%; max-width: 400px; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);">
                </div>

                <div class="full-player-info">
                    <h1 class="headline-medium">${escapeHtml(song.title || 'Unknown')}</h1>
                    <p class="body-large" style="color: var(--md-sys-color-on-surface-variant); margin-top: 8px;">
                        ${escapeHtml(song.artist || 'Unknown Artist')}
                    </p>
                    ${song.album ? `<p class="body-medium" style="color: var(--md-sys-color-on-surface-variant); margin-top: 4px;">${escapeHtml(song.album)}</p>` : ''}
                </div>

                ${this.embedUrl ? `
                    <div class="full-player-embed">
                        <iframe
                            width="100%"
                            height="315"
                            src="${this.embedUrl}"
                            frameborder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowfullscreen
                            style="border-radius: 12px; max-width: 600px; margin: 0 auto; display: block;">
                        </iframe>
                    </div>
                ` : `
                    <div class="full-player-controls-container">
                        <div class="full-player-progress">
                            <span class="player-current-time">0:00</span>
                            <div class="player-progress-bar" onclick="player.seekFromClick(event)" style="flex: 1; margin: 0 16px;">
                                <div class="player-progress-filled"></div>
                            </div>
                            <span class="player-duration">0:00</span>
                        </div>

                        <div class="full-player-controls">
                            <button class="full-player-btn" onclick="player.playPrevious()">
                                <span style="font-size: 40px;">⏮</span>
                            </button>

                            <button class="full-player-btn full-player-play-btn" onclick="player.toggle()">
                                <span style="font-size: 56px;">${this.isPlaying ? '⏸' : '▶'}</span>
                            </button>

                            <button class="full-player-btn" onclick="player.playNext()">
                                <span style="font-size: 40px;">⏭</span>
                            </button>
                        </div>

                        <div class="full-player-volume">
                            <span style="font-size: 24px;">🔊</span>
                            <div class="player-volume-bar" onclick="player.setVolumeFromClick(event)" style="flex: 1; max-width: 300px; margin: 0 16px;">
                                <div class="player-volume-filled" style="width: ${this.audio.volume * 100}%;"></div>
                            </div>
                            <span class="body-small">${Math.round(this.audio.volume * 100)}%</span>
                        </div>
                    </div>
                `}
            </div>
        `;

        document.body.appendChild(modal);

        // Animate in
        setTimeout(() => modal.classList.add('active'), 10);
    }

    closeFullPlayer() {
        const modal = document.getElementById('full-player-modal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }
    }

    seekFromClick(event) {
        const bar = event.currentTarget;
        const rect = bar.getBoundingClientRect();
        const percent = ((event.clientX - rect.left) / rect.width) * 100;
        this.seek(percent);
    }

    setVolumeFromClick(event) {
        const bar = event.currentTarget;
        const rect = bar.getBoundingClientRect();
        const volume = (event.clientX - rect.left) / rect.width;
        this.setVolume(Math.max(0, Math.min(1, volume)));
    }
}

const player = new MusicPlayer();

// Make player globally accessible
window.player = player;

// ============================================
// 5. Page Handlers
// ============================================

// Home page
router.register('/', async function() {
    const content = document.getElementById('main-content');

    content.innerHTML = `
        <div class="container">
            <h1 class="headline-large mb-2">Home</h1>
            <p class="body-large" style="color: var(--md-sys-color-on-surface-variant);">
                Loading...
            </p>
        </div>
    `;

    try {
        const data = await api.getHome();

        debug.log('Home feed loaded:', data);

        content.innerHTML = `
            <div class="container">
                <h1 class="headline-large mb-3">Discover Music</h1>
                <p class="body-large" style="color: var(--md-sys-color-on-surface-variant); margin-bottom: 24px;">
                    Welcome to Metrolist! Stream millions of songs from YouTube Music.
                </p>

                <div class="card mt-3" style="background: linear-gradient(135deg, var(--md-sys-color-primary-container), var(--md-sys-color-secondary-container));">
                    <h2 class="title-large mb-2">🎵 Start Listening</h2>
                    <p class="body-medium" style="color: var(--md-sys-color-on-surface-variant); margin-bottom: 16px;">
                        Search for your favorite artists, songs, or albums and start streaming instantly.
                    </p>
                    <button class="btn btn-filled" onclick="router.navigate('/search')">
                        🔍 Search Music
                    </button>
                </div>

                <div class="card mt-3">
                    <h2 class="title-large mb-2">✨ Features</h2>
                    <ul class="body-medium" style="color: var(--md-sys-color-on-surface-variant); line-height: 2;">
                        <li>🎵 Stream millions of songs from YouTube Music</li>
                        <li>⚡ High-performance web player</li>
                        <li>🎨 Beautiful Material 3 design</li>
                        <li>📱 Works on all devices</li>
                        <li>🔒 No sign-in required</li>
                    </ul>
                </div>
            </div>
        `;
    } catch (error) {
        debug.error('Failed to load home feed:', error);
        content.innerHTML = `
            <div class="container">
                <h1 class="headline-large mb-2">Home</h1>
                <div class="card" style="background-color: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container);">
                    <p>Failed to load home feed: ${error.message}</p>
                    <button class="btn btn-outlined mt-2" onclick="router.navigate('/search')">
                        Go to Search
                    </button>
                </div>
            </div>
        `;
    }
});

// Search page
router.register('/search', function() {
    const content = document.getElementById('main-content');

    content.innerHTML = `
        <div class="container">
            <h1 class="headline-large mb-3">Search</h1>

            <div style="position: relative;">
                <input type="text"
                       class="text-field"
                       placeholder="🔍 Search for songs, artists, albums..."
                       id="search-input"
                       autocomplete="off"
                       style="padding-left: 48px;">
                <span style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); font-size: 20px; opacity: 0.6;">🔍</span>
            </div>

            <div id="search-results" class="mt-3"></div>
        </div>
    `;

    // Set up search
    const searchInput = document.getElementById('search-input');
    let searchTimeout;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);

        const query = e.target.value.trim();

        if (query.length < 2) {
            document.getElementById('search-results').innerHTML = '';
            return;
        }

        // Debounce search
        searchTimeout = setTimeout(async () => {
            await performSearch(query);
        }, 300);
    });

    searchInput.focus();
});

async function performSearch(query) {
    const resultsDiv = document.getElementById('search-results');

    resultsDiv.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <p class="body-large" style="color: var(--md-sys-color-on-surface-variant);">🔍 Searching...</p>
        </div>
    `;

    try {
        const data = await api.search(query);

        debug.log('Search results:', data);

        // Parse search results
        const items = parseSearchResults(data.results);

        if (items.length === 0) {
            resultsDiv.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <p class="body-large" style="color: var(--md-sys-color-on-surface-variant);">
                        No results found for "${query}"
                    </p>
                </div>
            `;
            return;
        }

        // Store queue in appState
        appState.setQueue(items, 0);

        // Render results with improved design
        resultsDiv.innerHTML = `
            <p class="body-medium" style="color: var(--md-sys-color-on-surface-variant; margin-bottom: 16px;">
                Found ${items.length} results
            </p>
            ${items.map((item, index) => `
                <div class="list-item list-item-hover" onclick='playSongFromQueue(${index})' style="cursor: pointer;">
                    <div class="list-item-leading">
                        <img src="${item.thumbnail || '/assets/icons/default-album.svg'}"
                             style="width: 56px; height: 56px; border-radius: 8px; object-fit: cover;"
                             alt="${item.title}">
                    </div>
                    <div class="list-item-content">
                        <div class="list-item-title">${escapeHtml(item.title)}</div>
                        <div class="list-item-subtitle">${escapeHtml(item.artist || 'Unknown Artist')}</div>
                        ${item.album ? `<div class="list-item-subtitle" style="font-size: 12px;">${escapeHtml(item.album)}</div>` : ''}
                    </div>
                    <div class="list-item-trailing">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--md-sys-color-primary); display: flex; align-items: center; justify-content: center;">
                            <span style="font-size: 20px; filter: grayscale(100%) brightness(2);">▶</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        `;

    } catch (error) {
        debug.error('Search failed:', error);
        resultsDiv.innerHTML = `
            <div class="card" style="background-color: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container);">
                <p class="body-medium">❌ Search failed: ${escapeHtml(error.message)}</p>
                <p class="body-small mt-2">Try searching again or check your connection.</p>
            </div>
        `;
    }
}

// FIXED: Comprehensive YouTube API result parser with extensive videoId extraction
function parseSearchResults(results) {
    const items = [];

    try {
        // Navigate YouTube's complex response structure
        const contents = results?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

        for (const section of contents) {
            const items_data = section?.musicShelfRenderer?.contents || [];

            for (const item of items_data) {
                const renderer = item?.musicResponsiveListItemRenderer;
                if (!renderer) continue;

                // Extract videoId from MANY possible locations
                let videoId = null;

                // Method 1: overlay play button
                videoId = renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;

                // Method 2: flexColumns first column navigation
                if (!videoId) {
                    const firstColumn = renderer?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer;
                    videoId = firstColumn?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
                }

                // Method 3: menu navigation items
                if (!videoId && renderer?.menu) {
                    const menuItems = renderer?.menu?.menuRenderer?.items || [];
                    for (const menuItem of menuItems) {
                        const menuNav = menuItem?.menuNavigationItemRenderer?.navigationEndpoint?.watchEndpoint?.videoId;
                        const menuService = menuItem?.menuServiceItemRenderer?.serviceEndpoint?.queueAddEndpoint?.queueTarget?.videoId;
                        if (menuNav) {
                            videoId = menuNav;
                            break;
                        }
                        if (menuService) {
                            videoId = menuService;
                            break;
                        }
                    }
                }

                // Method 4: playlistItemData
                if (!videoId) {
                    videoId = renderer?.playlistItemData?.videoId;
                }

                // Method 5: direct navigation endpoint
                if (!videoId) {
                    videoId = renderer?.navigationEndpoint?.watchEndpoint?.videoId;
                }

                // Method 6: Deep search in all navigationEndpoints
                if (!videoId) {
                    const searchObject = (obj, depth = 0) => {
                        if (depth > 10) return null; // Prevent infinite recursion
                        if (obj?.watchEndpoint?.videoId) return obj.watchEndpoint.videoId;
                        if (obj?.videoId && typeof obj.videoId === 'string' && obj.videoId.length === 11) {
                            return obj.videoId;
                        }
                        if (typeof obj === 'object' && obj !== null) {
                            for (const key in obj) {
                                const result = searchObject(obj[key], depth + 1);
                                if (result) return result;
                            }
                        }
                        return null;
                    };
                    videoId = searchObject(renderer);
                }

                // Skip if no videoId found
                if (!videoId) {
                    debug.warn('No videoId found for item:', renderer);
                    // Log the first few keys to help debug
                    debug.log('Available keys:', Object.keys(renderer).slice(0, 10).join(', '));
                    continue;
                }

                const flexColumns = renderer.flexColumns || [];
                const thumbnail = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url;

                // Extract title
                const titleRuns = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
                const title = titleRuns[0]?.text || 'Unknown Title';

                // Extract artist and album from second column
                const secondColumnRuns = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
                let artist = '';
                let album = '';

                if (secondColumnRuns.length > 0) {
                    artist = secondColumnRuns[0]?.text || '';
                    // Album is usually after a separator
                    if (secondColumnRuns.length >= 3) {
                        album = secondColumnRuns[2]?.text || '';
                    }
                }

                items.push({
                    videoId,
                    title,
                    artist,
                    album,
                    thumbnail
                });
            }
        }
    } catch (error) {
        debug.error('Failed to parse search results:', error);
    }

    debug.log('Parsed items:', items);
    return items;
}

// Play song from queue
function playSongFromQueue(index) {
    const song = appState.queue[index];
    if (!song) {
        debug.error('Song not found at index:', index);
        return;
    }

    appState.queueIndex = index;
    debug.log('Playing song from queue:', song);
    appState.setCurrentSong(song);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make functions globally accessible
window.playSongFromQueue = playSongFromQueue;

// Library page
router.register('/library', function() {
    const content = document.getElementById('main-content');

    content.innerHTML = `
        <div class="container">
            <h1 class="headline-large mb-3">📚 Library</h1>

            <div class="card">
                <p class="body-large" style="color: var(--md-sys-color-on-surface-variant);">
                    Your saved music and playlists will appear here.
                </p>
                <p class="body-medium mt-2" style="color: var(--md-sys-color-on-surface-variant);">
                    This feature is coming soon! For now, use search to find and play music.
                </p>
                <button class="btn btn-filled mt-3" onclick="router.navigate('/search')">
                    🔍 Search Music
                </button>
            </div>
        </div>
    `;
});

// Settings page
router.register('/settings', function() {
    const content = document.getElementById('main-content');

    content.innerHTML = `
        <div class="container">
            <h1 class="headline-large mb-3">⚙️ Settings</h1>

            <div class="card mb-3">
                <h2 class="title-medium mb-2">About Metrolist</h2>
                <p class="body-medium" style="color: var(--md-sys-color-on-surface-variant); line-height: 1.6;">
                    <strong>Version:</strong> 1.0.0<br>
                    <strong>Platform:</strong> Web<br>
                    <strong>Music Source:</strong> YouTube Music<br><br>
                    High-performance music streaming web app with Material 3 design.
                </p>
            </div>

            <div class="card mb-3">
                <h2 class="title-medium mb-2">🐛 Debug Tools</h2>
                <p class="body-medium mb-3" style="color: var(--md-sys-color-on-surface-variant);">
                    Download debug logs to troubleshoot issues.
                </p>
                <button class="btn btn-outlined" onclick="debug.downloadLogs()">
                    📥 Download Debug Logs
                </button>
                <button class="btn btn-outlined ml-2" onclick="debug.clearLogs()">
                    🗑️ Clear Logs
                </button>
            </div>

            <div class="card">
                <h2 class="title-medium mb-2">ℹ️ Information</h2>
                <p class="body-small" style="color: var(--md-sys-color-on-surface-variant); line-height: 1.6;">
                    This is a web-based music streaming application that uses YouTube Music's public API.
                    No personal data is collected or stored. All streaming is done directly from YouTube's servers.
                </p>
            </div>
        </div>
    `;
});

// ============================================
// 6. Initialization
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    debug.mark('app-init-start');

    // Navigate to current path
    await router.navigate(location.pathname, false);

    debug.mark('app-init-end');
    debug.measure('App Initialization', 'app-init-start', 'app-init-end');

    debug.log('Metrolist app initialized!');
});
