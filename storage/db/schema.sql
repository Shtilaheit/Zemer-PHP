-- Metrolist Web Database Schema
-- Optimized for fast queries with proper indexes

-- Songs table
CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist_id TEXT,
    artist_name TEXT,
    album_id TEXT,
    album_name TEXT,
    duration INTEGER,
    thumbnail_url TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist_id);
CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album_id);

-- Albums table
CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist_id TEXT,
    artist_name TEXT,
    year INTEGER,
    thumbnail_url TEXT,
    description TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id);
CREATE INDEX IF NOT EXISTS idx_albums_title ON albums(title);

-- Artists table
CREATE TABLE IF NOT EXISTS artists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    thumbnail_url TEXT,
    subscribers INTEGER DEFAULT 0,
    description TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);

-- Playlists table
CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    user_id TEXT,
    is_public INTEGER DEFAULT 1,
    song_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);

-- Playlist songs (many-to-many)
CREATE TABLE IF NOT EXISTS playlist_songs (
    playlist_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    added_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (playlist_id, song_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_playlist_songs_position ON playlist_songs(playlist_id, position);

-- Lyrics table
CREATE TABLE IF NOT EXISTS lyrics (
    song_id TEXT PRIMARY KEY,
    synced_lyrics TEXT,
    plain_lyrics TEXT,
    source TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
) WITHOUT ROWID;

-- Search history
CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    user_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_created ON search_history(created_at DESC);

-- Play history
CREATE TABLE IF NOT EXISTS play_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id TEXT NOT NULL,
    user_id TEXT,
    played_at INTEGER DEFAULT (strftime('%s', 'now')),
    duration_played INTEGER,
    FOREIGN KEY (song_id) REFERENCES songs(id)
);

CREATE INDEX IF NOT EXISTS idx_play_history_song ON play_history(song_id);
CREATE INDEX IF NOT EXISTS idx_play_history_user ON play_history(user_id);
CREATE INDEX IF NOT EXISTS idx_play_history_played ON play_history(played_at DESC);

-- Users table (for future auth)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    password_hash TEXT,
    name TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    last_login INTEGER
) WITHOUT ROWID;

-- API cache table (alternative to APCu)
CREATE TABLE IF NOT EXISTS api_cache (
    key TEXT PRIMARY KEY,
    value BLOB NOT NULL,
    expires_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
) WITHOUT ROWID;

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('theme', 'dark'),
    ('quality', 'high'),
    ('autoplay', '1'),
    ('volume', '80');
