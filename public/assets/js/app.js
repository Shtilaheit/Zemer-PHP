/**
 * Metrolist Web App
 * High-performance vanilla JavaScript music streaming app
 */

// ============================================
// 1. App State Management
// ============================================

class AppState {
    constructor() {
        this.currentRoute = '/';
        this.currentSong = null;
        this.queue = [];
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
// 4. Music Player
// ============================================

class MusicPlayer {
    constructor() {
        this.audio = new Audio();
        this.currentSong = null;
        this.isPlaying = false;

        // Set up audio events
        this.audio.addEventListener('ended', () => this.playNext());
        this.audio.addEventListener('play', () => this.updatePlayState(true));
        this.audio.addEventListener('pause', () => this.updatePlayState(false));
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('loadedmetadata', () => this.onLoadedMetadata());

        // Set volume
        this.audio.volume = appState.volume;

        // Listen to state changes
        appState.on('songChanged', (song) => this.loadSong(song));
    }

    async loadSong(song) {
        if (!song || !song.videoId) {
            debug.error('Invalid song data', song);
            return;
        }

        debug.log('Loading song:', song);

        this.currentSong = song;

        try {
            // Get streaming URL
            const data = await api.getStreamingUrl(song.videoId);

            if (!data.streamingUrl) {
                throw new Error('No streaming URL available');
            }

            // Load audio
            this.audio.src = data.streamingUrl;
            this.audio.load();

            // Show mini player
            this.showMiniPlayer();

            // Auto-play
            await this.play();

        } catch (error) {
            debug.error('Failed to load song:', error);
            alert('Failed to play song: ' + error.message);
        }
    }

    async play() {
        try {
            await this.audio.play();
            this.isPlaying = true;
            appState.setPlaying(true);
            debug.log('Playing:', this.currentSong?.title);
        } catch (error) {
            debug.error('Play failed:', error);
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

    seek(time) {
        this.audio.currentTime = time;
    }

    setVolume(volume) {
        this.audio.volume = volume;
        appState.volume = volume;
    }

    playNext() {
        // TODO: Implement queue system
        debug.log('Playing next song');
    }

    updatePlayState(isPlaying) {
        const playButton = document.querySelector('#mini-player .play-button');
        if (playButton) {
            playButton.textContent = isPlaying ? '⏸️' : '▶️';
        }
    }

    updateProgress() {
        const progressBar = document.querySelector('#mini-player .progress-bar');
        if (progressBar && this.audio.duration) {
            const percent = (this.audio.currentTime / this.audio.duration) * 100;
            progressBar.style.width = `${percent}%`;
        }
    }

    onLoadedMetadata() {
        debug.log('Audio loaded, duration:', this.audio.duration);
    }

    showMiniPlayer() {
        const miniPlayer = document.getElementById('mini-player');
        if (!miniPlayer) return;

        miniPlayer.classList.add('active');

        const song = this.currentSong;

        miniPlayer.innerHTML = `
            <div style="flex: 1; display: flex; align-items: center; gap: 12px;">
                <img src="${song.thumbnail || '/assets/icons/default-album.svg'}"
                     style="width: 48px; height: 48px; border-radius: 4px; object-fit: cover;">
                <div style="flex: 1; min-width: 0;">
                    <div class="title-medium text-truncate">${song.title || 'Unknown'}</div>
                    <div class="body-small text-truncate" style="color: var(--md-sys-color-on-surface-variant);">
                        ${song.artist || 'Unknown Artist'}
                    </div>
                </div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
                <button class="btn-icon play-button" onclick="player.toggle()">
                    ${this.isPlaying ? '⏸️' : '▶️'}
                </button>
                <button class="btn-icon" onclick="player.playNext()">⏭️</button>
            </div>
            <div class="progress-container" style="position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: var(--md-sys-color-outline);">
                <div class="progress-bar" style="height: 100%; background: var(--md-sys-color-primary); width: 0%; transition: width 0.1s;"></div>
            </div>
        `;
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
                <h1 class="headline-large mb-3">Discover</h1>
                <p class="body-large" style="color: var(--md-sys-color-on-surface-variant); margin-bottom: 24px;">
                    Welcome to Metrolist! Search for music to get started.
                </p>

                <div class="card mt-3">
                    <h2 class="title-large mb-2">Quick Start</h2>
                    <p class="body-medium" style="color: var(--md-sys-color-on-surface-variant); margin-bottom: 16px;">
                        Try searching for your favorite artists, songs, or albums.
                    </p>
                    <button class="btn btn-filled" onclick="router.navigate('/search')">
                        🔍 Start Searching
                    </button>
                </div>
            </div>
        `;
    } catch (error) {
        debug.error('Failed to load home feed:', error);
        content.innerHTML = `
            <div class="container">
                <h1 class="headline-large mb-2">Home</h1>
                <div class="card" style="background-color: var(--md-sys-color-error); color: var(--md-sys-color-on-error);">
                    <p>Failed to load home feed: ${error.message}</p>
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

            <input type="text"
                   class="text-field"
                   placeholder="Search for songs, artists, albums..."
                   id="search-input"
                   autocomplete="off">

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

    resultsDiv.innerHTML = '<p class="body-large">Searching...</p>';

    try {
        const data = await api.search(query);

        debug.log('Search results:', data);

        // Parse search results (simplified)
        const items = parseSearchResults(data.results);

        if (items.length === 0) {
            resultsDiv.innerHTML = '<p class="body-large" style="color: var(--md-sys-color-on-surface-variant);">No results found</p>';
            return;
        }

        // Render results
        resultsDiv.innerHTML = items.map(item => `
            <div class="list-item" onclick='playSong(${JSON.stringify(item)})'>
                <div class="list-item-leading">
                    <img src="${item.thumbnail || '/assets/icons/default-album.svg'}"
                         style="width: 56px; height: 56px; border-radius: 4px; object-fit: cover;">
                </div>
                <div class="list-item-content">
                    <div class="list-item-title">${item.title}</div>
                    <div class="list-item-subtitle">${item.artist || 'Unknown Artist'}</div>
                </div>
                <div class="list-item-trailing">
                    <span style="font-size: 24px;">▶️</span>
                </div>
            </div>
        `).join('');

    } catch (error) {
        debug.error('Search failed:', error);
        resultsDiv.innerHTML = `
            <div class="card" style="background-color: var(--md-sys-color-error); color: var(--md-sys-color-on-error);">
                <p>Search failed: ${error.message}</p>
            </div>
        `;
    }
}

// Parse search results (simplified parser)
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

                const flexColumns = renderer.flexColumns || [];
                const thumbnail = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url;
                const videoId = renderer.playlistItemData?.videoId;

                if (flexColumns.length >= 1) {
                    const titleRuns = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
                    const title = titleRuns[0]?.text || 'Unknown';

                    const artistRuns = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
                    const artist = artistRuns[0]?.text || '';

                    items.push({
                        videoId,
                        title,
                        artist,
                        thumbnail
                    });
                }
            }
        }
    } catch (error) {
        debug.error('Failed to parse search results:', error);
    }

    return items;
}

// Play song
function playSong(song) {
    debug.log('Play song clicked:', song);
    appState.setCurrentSong(song);
}

// Make playSong globally accessible
window.playSong = playSong;

// Library page
router.register('/library', function() {
    const content = document.getElementById('main-content');

    content.innerHTML = `
        <div class="container">
            <h1 class="headline-large mb-2">Library</h1>
            <p class="body-large" style="color: var(--md-sys-color-on-surface-variant);">
                Your saved music will appear here.
            </p>
        </div>
    `;
});

// Settings page
router.register('/settings', function() {
    const content = document.getElementById('main-content');

    content.innerHTML = `
        <div class="container">
            <h1 class="headline-large mb-3">Settings</h1>

            <div class="card mb-2">
                <h2 class="title-medium mb-2">About</h2>
                <p class="body-medium" style="color: var(--md-sys-color-on-surface-variant);">
                    Metrolist Web v1.0.0<br>
                    High-performance music streaming from YouTube Music
                </p>
            </div>

            <div class="card">
                <h2 class="title-medium mb-2">Debug</h2>
                <button class="btn btn-outlined" onclick="debug.downloadLogs()">
                    Download Debug Logs
                </button>
            </div>
        </div>
    `;
});

// ============================================
// 6. Initialize App
// ============================================

debug.mark('app-init-start');

// Navigate to initial route
router.navigate(location.pathname, false);

debug.mark('app-init-end');
debug.measure('App Initialization', 'app-init-start', 'app-init-end');

debug.log('Metrolist app initialized!');
