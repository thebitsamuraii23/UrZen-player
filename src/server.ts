// @ts-nocheck
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');

const PROJECT_ROOT = process.cwd();
const USER_MEDIA_ROOT = path.join(PROJECT_ROOT, 'User', 'Downloads');
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 1024 * 1024 * 200);
const PLAYLIST_COVER_MAX_BYTES = Number(process.env.PLAYLIST_COVER_MAX_BYTES || 20 * 1024 * 1024);
const PLAYLIST_COVER_DIR_NAME = 'playlist-covers';
const PLAYLIST_COVER_MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif'
};
const ALLOWED_PLAYLIST_COVER_EXTENSIONS = new Set(Object.values(PLAYLIST_COVER_MIME_TO_EXT));

try {
  fs.mkdirSync(USER_MEDIA_ROOT, { recursive: true });
} catch (error) {
  console.error('[MEDIA] Failed to create base media directory:', USER_MEDIA_ROOT, error);
}

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const DEFAULT_NAVIDROME_SERVER = process.env.DEFAULT_NAVIDROME_SERVER || 'https://music.youtubemusicdownloader.life';
const DEFAULT_NAVIDROME_USER = process.env.DEFAULT_NAVIDROME_USER || 'guest';
const DEFAULT_NAVIDROME_PASS = process.env.DEFAULT_NAVIDROME_PASS || 'guest';
const AI_PLAYLIST_DEFAULT_TRACK_COUNT = 20;
const AI_PLAYLIST_MIN_TRACK_COUNT = 1;
const AI_PLAYLIST_MAX_TRACK_COUNT = 2000;
const INACTIVE_ACCOUNT_MAX_DAYS = Math.max(1, Number(process.env.INACTIVE_ACCOUNT_MAX_DAYS || 30));
const INACTIVE_CLEANUP_INTERVAL_MS = Math.max(60 * 1000, Number(process.env.INACTIVE_CLEANUP_INTERVAL_MS || 12 * 60 * 60 * 1000));
let inactiveCleanupTimer = null;

// Middleware
const isDev = process.env.NODE_ENV !== 'production';
app.disable('x-powered-by');
app.use(cors({
  origin: isDev
    ? ['http://localhost:3000', 'http://localhost:5500', 'http://localhost:5501', 'http://127.0.0.1:5500', 'http://127.0.0.1:5501', 'http://127.0.0.1:3000']
    : (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean) : false),
  credentials: true
}));
const jsonParser = express.json({ limit: '1mb' });
app.use((req, res, next) => {
  if (
    req.path === '/api/user/local-tracks/upload'
    || /^\/api\/playlists\/[^/]+\/cover$/i.test(String(req.path || ''))
  ) {
    return next();
  }
  return jsonParser(req, res, next);
});

// Database initialization
const dbPath = process.env.DB_PATH || './users.db';
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database error:', err.message);
    process.exit(1);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON');

    // Create users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        navidrome_server TEXT,
        navidrome_user TEXT,
        navidrome_pass TEXT,
        last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('[DB] Users table error:', err.message);
      else console.log('[DB] Users table ready');
    });
    
    // Create playlists table
    db.run(`
      CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        cover_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, name)
      )
    `, (err) => {
      if (err) console.error('[DB] Playlists table error:', err.message);
      else console.log('[DB] Playlists table ready');
    });
    
    // Create playlist_tracks table
    db.run(`
      CREATE TABLE IF NOT EXISTS playlist_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        track_title TEXT NOT NULL,
        track_artist TEXT,
        track_album TEXT,
        track_duration INTEGER,
        track_source TEXT DEFAULT 'local',
        local_track_id INTEGER,
        navidrome_id TEXT,
        cover_art_id TEXT,
        track_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('[DB] Playlist_tracks table error:', err.message);
      else console.log('[DB] Playlist_tracks table ready');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS user_local_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        file_hash TEXT NOT NULL,
        original_file_name TEXT,
        stored_file_name TEXT NOT NULL,
        mime_type TEXT,
        file_size INTEGER,
        title TEXT,
        artist TEXT,
        album TEXT,
        duration INTEGER,
        cover_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, file_hash)
      )
    `, (err) => {
      if (err) console.error('[DB] user_local_tracks table error:', err.message);
      else console.log('[DB] user_local_tracks table ready');
    });

    db.run(
      'CREATE INDEX IF NOT EXISTS idx_user_local_tracks_user_id ON user_local_tracks(user_id)',
      (err) => {
        if (err) console.warn('[DB] idx_user_local_tracks_user_id index:', err.message);
      }
    );

    // Add missing columns for existing databases
    db.run('ALTER TABLE users ADD COLUMN navidrome_server TEXT', (err) => {
      if (err && !String(err.message || '').includes('duplicate column')) {
        console.warn('[DB] navidrome_server column:', err.message);
      }
    });
    db.run('ALTER TABLE users ADD COLUMN navidrome_user TEXT', (err) => {
      if (err && !String(err.message || '').includes('duplicate column')) {
        console.warn('[DB] navidrome_user column:', err.message);
      }
    });
    db.run('ALTER TABLE users ADD COLUMN navidrome_pass TEXT', (err) => {
      if (err && !String(err.message || '').includes('duplicate column')) {
        console.warn('[DB] navidrome_pass column:', err.message);
      }
    });
    db.run('ALTER TABLE users ADD COLUMN last_active_at DATETIME', (err) => {
      if (err && !String(err.message || '').includes('duplicate column')) {
        console.warn('[DB] last_active_at column:', err.message);
      }
    });
    db.run('ALTER TABLE playlist_tracks ADD COLUMN track_url TEXT', (err) => {
      if (err && !String(err.message || '').includes('duplicate column')) {
        console.warn('[DB] track_url column:', err.message);
      }
    });
    db.run('ALTER TABLE playlist_tracks ADD COLUMN local_track_id INTEGER', (err) => {
      if (err && !String(err.message || '').includes('duplicate column')) {
        console.warn('[DB] local_track_id column:', err.message);
      }
    });
    db.run('ALTER TABLE playlists ADD COLUMN cover_path TEXT', (err) => {
      if (err && !String(err.message || '').includes('duplicate column')) {
        console.warn('[DB] playlists.cover_path column:', err.message);
      }
    });
    db.run('CREATE INDEX IF NOT EXISTS idx_users_last_active_at ON users(last_active_at)', (err) => {
      if (err) {
        console.warn('[DB] idx_users_last_active_at index:', err.message);
      }
    });
    db.run('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE last_active_at IS NULL', (err) => {
      if (err) {
        console.warn('[DB] users.last_active_at backfill:', err.message);
      }
    });
    db.run('SELECT 1', () => {
      startInactiveCleanupScheduler();
    });
  });
}

// Utility function to validate input
const validateInput = (username, password) => {
  if (!username || !password) {
    return { valid: false, error: 'Username and password are required' };
  }
  if (username.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }
  if (password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }
  return { valid: true };
};

function decodeHeaderValue(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(String(value));
  } catch (e) {
    return String(value);
  }
}

function parseTrackMeta(req) {
  const raw = req.headers['x-track-meta'];
  if (!raw) return {};
  try {
    const decoded = decodeHeaderValue(raw);
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function sanitizeUploadFileName(name) {
  const base = path.basename(String(name || 'track.bin'));
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  return cleaned || 'track.bin';
}

function sanitizeUsername(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'anonymous';
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  return cleaned || 'anonymous';
}

function buildUserMediaDir(userId, username) {
  const safeUser = sanitizeUsername(username || userId);
  return path.join(USER_MEDIA_ROOT, safeUser);
}

async function ensureUserMediaDir(userId, username) {
  const dir = buildUserMediaDir(userId, username);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

function buildUserPlaylistCoverDir(userId, username) {
  return path.join(buildUserMediaDir(userId, username), PLAYLIST_COVER_DIR_NAME);
}

async function ensureUserPlaylistCoverDir(userId, username) {
  const dir = buildUserPlaylistCoverDir(userId, username);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

function resolvePlaylistCoverExtension(mimeType = '', originalFileName = '') {
  const normalizedMime = String(mimeType || '').toLowerCase().split(';')[0].trim();
  if (PLAYLIST_COVER_MIME_TO_EXT[normalizedMime]) {
    return PLAYLIST_COVER_MIME_TO_EXT[normalizedMime];
  }
  const rawExt = path.extname(String(originalFileName || '')).toLowerCase().trim();
  if (ALLOWED_PLAYLIST_COVER_EXTENSIONS.has(rawExt)) {
    return rawExt;
  }
  return '';
}

function getPlaylistCoverMimeType(fileName = '') {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.avif') return 'image/avif';
  return 'application/octet-stream';
}

function buildPlaylistCoverUrl(playlistId) {
  return `/api/playlists/${playlistId}/cover`;
}

function mapPlaylistRow(row = {}) {
  const coverPath = String(row.cover_path || '').trim();
  return {
    ...row,
    cover_path: coverPath,
    cover_url: coverPath ? buildPlaylistCoverUrl(row.id) : ''
  };
}

function buildLocalTrackUrl(trackId) {
  return `/api/user/local-tracks/${trackId}/stream`;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}

function normalizeServerUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return DEFAULT_NAVIDROME_SERVER.replace(/\/+$/, '');
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, '');
}

function getInactiveCutoffSql(days) {
  return `-${Math.max(1, Number(days) || 30)} days`;
}

async function removeUserMedia(userId, username) {
  const candidates = new Set([
    buildUserMediaDir(userId, username),
    buildUserMediaDir(userId, String(userId))
  ]);

  for (const dir of candidates) {
    try {
      await fsp.rm(dir, { recursive: true, force: true });
    } catch (error) {
      console.warn('[CLEANUP] Failed to remove user media dir:', dir, error?.message || error);
    }
  }
}

async function deleteUserCompletely(userId, username) {
  await removeUserMedia(userId, username);
  const result = await dbRunAsync('DELETE FROM users WHERE id = ?', [userId]);
  return Number(result?.changes || 0) > 0;
}

async function purgeInactiveUsers(reason = 'scheduled') {
  const cutoffSql = getInactiveCutoffSql(INACTIVE_ACCOUNT_MAX_DAYS);
  const inactiveUsers = await dbAllAsync(
    `SELECT id, username, created_at, last_active_at
     FROM users
     WHERE datetime(COALESCE(last_active_at, created_at, CURRENT_TIMESTAMP)) < datetime('now', ?)`,
    [cutoffSql]
  );

  if (!inactiveUsers.length) {
    return { deletedCount: 0, checkedCount: 0 };
  }

  let deletedCount = 0;
  for (const userRow of inactiveUsers) {
    const userId = Number(userRow?.id);
    if (!Number.isFinite(userId)) continue;
    const username = String(userRow?.username || userId);
    try {
      const removed = await deleteUserCompletely(userId, username);
      if (removed) {
        deletedCount += 1;
        console.log(`[CLEANUP] Deleted inactive user ${userId} (${username}) by ${reason}`);
      }
    } catch (error) {
      console.error(`[CLEANUP] Failed to delete inactive user ${userId} (${username}):`, error);
    }
  }

  return { deletedCount, checkedCount: inactiveUsers.length };
}

function startInactiveCleanupScheduler() {
  if (inactiveCleanupTimer) return;

  const runCleanup = async (reason) => {
    try {
      const result = await purgeInactiveUsers(reason);
      if (result.deletedCount > 0 || isDev) {
        console.log(
          `[CLEANUP] Inactive account sweep (${reason}): checked=${result.checkedCount}, deleted=${result.deletedCount}, threshold=${INACTIVE_ACCOUNT_MAX_DAYS}d`
        );
      }
    } catch (error) {
      console.error('[CLEANUP] Inactive account sweep failed:', error);
    }
  };

  runCleanup('startup');
  inactiveCleanupTimer = setInterval(() => {
    runCleanup('interval');
  }, INACTIVE_CLEANUP_INTERVAL_MS);
  if (typeof inactiveCleanupTimer.unref === 'function') {
    inactiveCleanupTimer.unref();
  }
}

async function touchUserActivity(userId) {
  if (!Number.isFinite(Number(userId))) {
    return { changes: 0 };
  }
  return dbRunAsync('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
}

function normalizeTagList(value, maxItems = 5) {
  if (!value) return [];
  const values = Array.isArray(value)
    ? value
    : String(value)
        .split(',')
        .map((item) => item.trim());
  const deduped = [];
  const seen = new Set();
  for (const item of values) {
    const normalized = String(item || '').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
    if (deduped.length >= maxItems) break;
  }
  return deduped;
}

function extractRequestedTrackCount(text) {
  const raw = String(text || '');
  if (!raw.trim()) return null;
  const normalized = raw.replace(/(\d)[,\s](?=\d{3}\b)/g, '$1');
  const patterns = [
    /(\d{1,4})\s*(?:songs?|tracks?|пес(?:ня|ни|ен|ней|нями|ням|нях)?|трек(?:ов|и|а)?|композиц(?:ия|ии|ий)?)/iu,
    /(?:songs?|tracks?|пес(?:ня|ни|ен|ней|нями|ням|нях)?|трек(?:ов|и|а)?|композиц(?:ия|ии|ий)?)\s*(?:count|qty|кол-?во)?\s*[:=]?\s*(\d{1,4})/iu
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) return Math.floor(value);
  }
  return null;
}

function dbGetAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function dbAllAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function dbRunAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function resolveUserNavidromeConfig(settingsRow) {
  return {
    server: normalizeServerUrl(settingsRow?.navidrome_server || DEFAULT_NAVIDROME_SERVER),
    user: String(settingsRow?.navidrome_user || DEFAULT_NAVIDROME_USER || '').trim(),
    pass: String(settingsRow?.navidrome_pass || DEFAULT_NAVIDROME_PASS || '').trim()
  };
}

function resolveRequestNavidromeConfig(settingsRow, payload = {}) {
  const bodyCfg = payload?.navidrome && typeof payload.navidrome === 'object' ? payload.navidrome : {};
  const merged = {
    navidrome_server: bodyCfg.server || settingsRow?.navidrome_server || DEFAULT_NAVIDROME_SERVER,
    navidrome_user: bodyCfg.user || settingsRow?.navidrome_user || DEFAULT_NAVIDROME_USER,
    navidrome_pass: bodyCfg.pass || settingsRow?.navidrome_pass || DEFAULT_NAVIDROME_PASS
  };
  return resolveUserNavidromeConfig(merged);
}

function buildSubsonicParams(config, extra = {}) {
  return {
    u: config.user,
    p: config.pass,
    v: '1.16.1',
    c: 'UrZen',
    f: 'json',
    ...extra
  };
}

function buildNavidromeCoverUrl(config, coverId, size = 300) {
  if (!coverId) return '';
  const params = new URLSearchParams(buildSubsonicParams(config, { id: coverId, size: String(size) }));
  return `${config.server}/rest/getCoverArt.view?${params.toString()}`;
}

function buildNavidromeStreamUrl(config, songId) {
  if (!songId) return '';
  const params = new URLSearchParams(buildSubsonicParams(config, { id: String(songId) }));
  return `${config.server}/rest/stream.view?${params.toString()}`;
}

async function navidromeRequest(config, endpoint, params = {}, timeoutMs = 12000) {
  const query = new URLSearchParams(buildSubsonicParams(config, params));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${config.server}/rest/${endpoint}?${query.toString()}`;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Navidrome HTTP ${response.status}`);
    }
    const data = await response.json();
    const payload = data?.['subsonic-response'];
    if (!payload || payload.status !== 'ok') {
      const message = payload?.error?.message || 'Navidrome API error';
      throw new Error(message);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function mapNavidromeSong(config, song) {
  if (!song?.id) return null;
  const cover = song.coverArt ? buildNavidromeCoverUrl(config, song.coverArt, 320) : '';
  return {
    id: String(song.id),
    navidrome_id: String(song.id),
    title: String(song.title || 'Unknown'),
    artist: String(song.artist || 'Unknown Artist'),
    album: String(song.album || ''),
    duration: Number(song.duration || 0) || 0,
    genre: String(song.genre || song.genreName || ''),
    cover_art_id: cover,
    track_url: '',
    track_source: 'navidrome'
  };
}

function normalizeCandidateTracksFromBody(rawTracks, maxItems = 420) {
  if (!Array.isArray(rawTracks) || !rawTracks.length) return [];
  const seen = new Set();
  const normalized = [];
  for (const item of rawTracks) {
    const id = String(
      item?.navidrome_id ||
      item?.navidromeId ||
      item?.id ||
      ''
    ).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push({
      id,
      navidrome_id: id,
      title: String(item?.title || 'Unknown'),
      artist: String(item?.artist || ''),
      album: String(item?.album || ''),
      duration: Number(item?.duration || 0) || 0,
      genre: String(item?.genre || ''),
      cover_art_id: String(item?.cover_art_id || item?.cover || ''),
      track_url: String(item?.track_url || ''),
      track_source: 'navidrome'
    });
    if (normalized.length >= maxItems) break;
  }
  return normalized;
}

function dedupeTracksById(tracks, excludeIds = []) {
  const blocked = new Set((excludeIds || []).map((id) => String(id || '').trim()).filter(Boolean));
  const seen = new Set();
  const deduped = [];
  for (const track of tracks || []) {
    const id = String(track?.navidrome_id || track?.id || '').trim();
    if (!id || blocked.has(id) || seen.has(id)) continue;
    seen.add(id);
    deduped.push(track);
  }
  return deduped;
}

function scoreTrackCandidate(track, plan = {}) {
  if (!track) return 0;
  const artists = normalizeTagList(plan.artists || [], 8).map((item) => item.toLowerCase());
  const genres = normalizeTagList(plan.genres || [], 8).map((item) => item.toLowerCase());
  const albums = normalizeTagList(plan.albums || [], 8).map((item) => item.toLowerCase());
  const mood = String(plan.mood || '').toLowerCase();
  const prompt = String(plan.prompt || '').toLowerCase();
  const title = String(track.title || '').toLowerCase();
  const artist = String(track.artist || '').toLowerCase();
  const album = String(track.album || '').toLowerCase();
  const genre = String(track.genre || '').toLowerCase();

  let score = 0;
  const artistMatch = artists.some((item) => artist.includes(item));
  const genreMatch = genres.some((item) => genre.includes(item));
  const albumMatch = albums.some((item) => album.includes(item));

  if (artistMatch) score += 45;
  if (genreMatch) score += 32;
  if (albumMatch) score += 28;
  if (artistMatch && albumMatch) score += 8;
  if (genreMatch && albumMatch) score += 6;
  if (mood && (title.includes(mood) || album.includes(mood) || genre.includes(mood))) score += 10;

  const promptParts = prompt.split(/[^a-zA-Z0-9а-яА-ЯёЁ]+/).filter((item) => item.length > 3).slice(0, 10);
  for (const part of promptParts) {
    if (title.includes(part)) score += 5;
    if (artist.includes(part)) score += 6;
    if (album.includes(part)) score += 3;
    if (genre.includes(part)) score += 4;
  }

  score += Math.max(0, 8 - Math.min(8, Number(track.duration || 0) / 60));
  return score;
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const direct = raw.match(/\{[\s\S]*\}/);
  if (!direct) return null;
  try {
    return JSON.parse(direct[0]);
  } catch (error) {
    return null;
  }
}

async function callGroqJSON({ systemPrompt, userPrompt, temperature = 0.2, maxTokens = 700 }) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Groq HTTP ${response.status}: ${text.slice(0, 220)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(content);
    if (!parsed) {
      throw new Error('Groq returned non-JSON response');
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

async function parsePlaylistRequestWithAI(requestText, explicitFields = {}) {
  const explicitTrackCount = explicitFields.trackCount ?? explicitFields.count;
  const requestedFromText = extractRequestedTrackCount(requestText);
  const requestedTrackCount = explicitTrackCount ?? requestedFromText;
  const fallback = {
    playlistName: String(explicitFields.playlistName || explicitFields.name || '').trim(),
    genres: normalizeTagList(explicitFields.genres || explicitFields.genre),
    artists: normalizeTagList(explicitFields.artists),
    mood: '',
    trackCount: clampNumber(
      requestedTrackCount,
      AI_PLAYLIST_MIN_TRACK_COUNT,
      AI_PLAYLIST_MAX_TRACK_COUNT,
      AI_PLAYLIST_DEFAULT_TRACK_COUNT
    )
  };

  if (!requestText || !GROQ_API_KEY) {
    return fallback;
  }

  try {
    const parsed = await callGroqJSON({
      systemPrompt:
        'You parse user music requests into strict JSON. Return only JSON object with keys: playlistName, genres, artists, mood, trackCount.',
      userPrompt: `Request: "${requestText}"`,
      temperature: 0.1,
      maxTokens: 300
    });

    return {
      playlistName: String(parsed.playlistName || fallback.playlistName || '').trim(),
      genres: normalizeTagList(parsed.genres || fallback.genres),
      artists: normalizeTagList(parsed.artists || fallback.artists),
      mood: String(parsed.mood || '').trim(),
      trackCount: clampNumber(
        parsed.trackCount,
        AI_PLAYLIST_MIN_TRACK_COUNT,
        AI_PLAYLIST_MAX_TRACK_COUNT,
        fallback.trackCount || AI_PLAYLIST_DEFAULT_TRACK_COUNT
      )
    };
  } catch (error) {
    console.warn('[AI] Failed to parse request with Groq, using fallback:', error.message);
    return fallback;
  }
}

async function rankTracksWithAI(seedSummary, tracks, limit) {
  const safeLimit = clampNumber(limit, 1, AI_PLAYLIST_MAX_TRACK_COUNT, 12);
  if (!GROQ_API_KEY || !Array.isArray(tracks) || !tracks.length) {
    return tracks.slice(0, safeLimit);
  }

  const compact = tracks.slice(0, 80).map((track) => ({
    id: String(track.navidrome_id || ''),
    title: track.title || '',
    artist: track.artist || '',
    album: track.album || '',
    genre: track.genre || ''
  }));

  try {
    const ranked = await callGroqJSON({
      systemPrompt:
        'You are a music ranking engine. Return strict JSON: {"pickedIds":["id1","id2"]}. Pick only from provided ids.',
      userPrompt: `Seed context: ${seedSummary}\nCandidates: ${JSON.stringify(compact)}\nPick ${safeLimit} ids.`,
      temperature: 0.25,
      maxTokens: 500
    });
    const picked = Array.isArray(ranked.pickedIds) ? ranked.pickedIds.map((id) => String(id)) : [];
    if (!picked.length) return tracks.slice(0, safeLimit);

    const byId = new Map(tracks.map((track) => [String(track.navidrome_id || ''), track]));
    const ordered = [];
    const used = new Set();
    for (const id of picked) {
      if (used.has(id)) continue;
      const match = byId.get(id);
      if (match) {
        ordered.push(match);
        used.add(id);
      }
      if (ordered.length >= safeLimit) break;
    }
    if (ordered.length < safeLimit) {
      for (const track of tracks) {
        const id = String(track.navidrome_id || '');
        if (!id || used.has(id)) continue;
        ordered.push(track);
        used.add(id);
        if (ordered.length >= safeLimit) break;
      }
    }
    return ordered;
  } catch (error) {
    console.warn('[AI] Failed to rank tracks with Groq, using heuristic order:', error.message);
    return tracks.slice(0, safeLimit);
  }
}

async function fetchCandidateTracks(config, { artists = [], genres = [], prompt = '', limit = 40 }) {
  const maxFetch = Math.max(40, Math.min(3200, Number(limit || 40)));
  const perQueryCount = Math.max(40, Math.min(400, Math.ceil(maxFetch / 3)));
  let allSongs = [];
  let had403 = false;
  let lastErrorMessage = '';

  const trackError = (error) => {
    const message = String(error?.message || error || '');
    lastErrorMessage = message;
    if (message.includes('403')) had403 = true;
  };

  for (const artist of normalizeTagList(artists, 6)) {
    try {
      const payload = await navidromeRequest(config, 'search3.view', { query: artist, songCount: perQueryCount });
      const songs = toArray(payload?.searchResult3?.song);
      allSongs.push(...songs);
    } catch (error) {
      console.warn('[AI] Artist search failed:', artist, error.message);
      trackError(error);
    }
  }

  for (const genre of normalizeTagList(genres, 6)) {
    try {
      const payload = await navidromeRequest(config, 'getSongsByGenre.view', { genre, count: perQueryCount, offset: 0 });
      const songs = toArray(payload?.songsByGenre?.song);
      allSongs.push(...songs);
    } catch (error) {
      console.warn('[AI] Genre search failed:', genre, error.message);
      trackError(error);
    }
  }

  if (prompt && String(prompt).trim().length > 1) {
    try {
      const payload = await navidromeRequest(config, 'search3.view', { query: String(prompt).trim(), songCount: perQueryCount });
      const songs = toArray(payload?.searchResult3?.song);
      allSongs.push(...songs);
    } catch (error) {
      console.warn('[AI] Prompt search failed:', error.message);
      trackError(error);
    }
  }

  if (!allSongs.length) {
    try {
      const payload = await navidromeRequest(config, 'getRandomSongs.view', { size: maxFetch });
      const songs = toArray(payload?.randomSongs?.song);
      allSongs.push(...songs);
    } catch (error) {
      console.warn('[AI] Random fallback failed:', error.message);
      trackError(error);
    }
  }

  if (!allSongs.length && had403) {
    throw new Error(`Navidrome authorization failed (HTTP 403). Check server/user/password in settings. Last error: ${lastErrorMessage}`);
  }

  const mapped = allSongs.map((song) => mapNavidromeSong(config, song)).filter(Boolean);
  return dedupeTracksById(mapped).slice(0, maxFetch);
}

async function ensureUniquePlaylistName(userId, baseName) {
  const cleanBase = String(baseName || '').trim() || 'AI Playlist';
  const existing = await dbAllAsync(
    'SELECT name FROM playlists WHERE user_id = ? AND name LIKE ?',
    [userId, `${cleanBase}%`]
  );
  const existingNames = new Set(existing.map((row) => String(row.name || '').trim().toLowerCase()).filter(Boolean));
  if (!existingNames.has(cleanBase.toLowerCase())) return cleanBase;
  let i = 2;
  while (i < 500) {
    const candidate = `${cleanBase} (${i})`;
    if (!existingNames.has(candidate.toLowerCase())) return candidate;
    i += 1;
  }
  return `${cleanBase} (${Date.now()})`;
}

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (isDev) {
    console.log('[MIDDLEWARE] Verifying token - Headers:', Object.keys(req.headers));
    console.log('[MIDDLEWARE] Auth header present:', Boolean(authHeader));
  }
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    if (isDev) console.log('[MIDDLEWARE] No token found');
    return res.status(401).json({ error: 'Token required' });
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      if (isDev) console.log('[MIDDLEWARE] Token verification failed:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    try {
      const touched = await touchUserActivity(user.userId);
      if (!touched.changes) {
        return res.status(401).json({ error: 'User account not found or removed' });
      }
      if (isDev) console.log('[MIDDLEWARE] Token verified - User:', user.userId);
      req.user = user;
      next();
    } catch (touchErr) {
      console.error('[MIDDLEWARE] Failed to update user activity:', touchErr);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};

const verifyTokenFlexible = (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = authHeader && authHeader.split(' ')[1];
  if (!token && req.query && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    if (isDev) console.log('[MIDDLEWARE] No token found (flexible)');
    return res.status(401).json({ error: 'Token required' });
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      if (isDev) console.log('[MIDDLEWARE] Flexible token verification failed:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    try {
      const touched = await touchUserActivity(user.userId);
      if (!touched.changes) {
        return res.status(401).json({ error: 'User account not found or removed' });
      }
      req.user = user;
      next();
    } catch (touchErr) {
      console.error('[MIDDLEWARE] Failed to update user activity (flexible):', touchErr);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};

// Register endpoint
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    const validation = validateInput(username, password);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Check if username already exists
    db.get('SELECT id FROM users WHERE username = ?', [username], async (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (row) {
        return res.status(400).json({ error: 'Username already taken' });
      }

      try {
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        db.run(
          'INSERT INTO users (username, password, last_active_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [username, hashedPassword],
          function(err) {
            if (err) {
              console.error('Insert error:', err);
              return res.status(400).json({ error: 'Username already taken' });
            }

            // Generate JWT (match login behavior so frontend can auto-sign-in)
            const token = jwt.sign(
              { userId: this.lastID, username: username },
              JWT_SECRET,
              { expiresIn: '7d' }
            );

            res.status(201).json({
              message: 'User registered successfully',
              userId: this.lastID,
              token,
              username
            });
          }
        );
      } catch (error) {
        console.error('Hashing error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    const validation = validateInput(username, password);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Find user
    db.get('SELECT id, username, password FROM users WHERE username = ?', [username], async (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!user) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      try {
        // Compare password
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
          return res.status(401).json({ error: 'Invalid username or password' });
        }

        try {
          const touched = await touchUserActivity(user.id);
          if (!touched.changes) {
            return res.status(401).json({ error: 'User account not found or removed' });
          }

          // Generate JWT
          const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
          );

          res.json({
            message: 'Login successful',
            token: token,
            username: user.username
          });
        } catch (touchErr) {
          console.error('Failed to update last_active_at on login:', touchErr);
          res.status(500).json({ error: 'Internal server error' });
        }
      } catch (error) {
        console.error('Password comparison error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token endpoint (for frontend validation)
app.post('/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const touched = await touchUserActivity(decoded.userId);
    if (!touched.changes) {
      return res.status(401).json({ valid: false, error: 'User account not found or removed' });
    }
    res.json({ valid: true, username: decoded.username, userId: decoded.userId });
  } catch (error) {
    res.status(401).json({ valid: false, error: 'Invalid or expired token' });
  }
});

// ============================================
// PLAYLIST MANAGEMENT ENDPOINTS
// ============================================

console.log('[ROUTES] Registering playlist endpoints...');

// GET user's playlists
app.get('/api/playlists', verifyToken, (req, res) => {
  console.log('[ROUTE] GET /api/playlists - User:', req.user?.userId);
  const userId = req.user.userId;
  
  db.all(
    'SELECT id, user_id, name, cover_path, created_at FROM playlists WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
    (err, rows) => {
      if (err) {
        console.error('[DB] Error fetching playlists:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      console.log('[ROUTE] Returning', rows?.length || 0, 'playlists');
      res.json((rows || []).map((row) => mapPlaylistRow(row)));
    }
  );
});

// CREATE new playlist
app.post('/api/playlists', verifyToken, (req, res) => {
  console.log('[ROUTE] POST /api/playlists - User:', req.user?.userId, 'Body:', req.body);
  const userId = req.user.userId;
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Playlist name is required' });
  }

  db.run(
    'INSERT INTO playlists (user_id, name) VALUES (?, ?)',
    [userId, name],
    function(err) {
      if (err) {
        console.error('[DB] Insert error:', err);
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Playlist with this name already exists' });
        }
        return res.status(500).json({ error: 'Internal server error' });
      }

      console.log('[ROUTE] Created playlist with ID:', this.lastID);
      res.status(201).json({
        id: this.lastID,
        user_id: userId,
        name: name,
        cover_path: '',
        cover_url: '',
        created_at: new Date().toISOString()
      });
    }
  );
});

// GET playlist details with tracks
app.get('/api/playlists/:playlistId', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const playlistId = req.params.playlistId;

  db.get(
    'SELECT id, user_id, name, cover_path, created_at FROM playlists WHERE id = ? AND user_id = ?',
    [playlistId, userId],
    (err, playlist) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!playlist) {
        return res.status(404).json({ error: 'Playlist not found' });
      }

      // Fetch tracks for this playlist
      db.all(
        'SELECT id, playlist_id, track_title, track_artist, track_album, track_duration, track_source, local_track_id, navidrome_id, cover_art_id, track_url FROM playlist_tracks WHERE playlist_id = ? ORDER BY id',
        [playlistId],
        (err, tracks) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          res.json({
            ...mapPlaylistRow(playlist),
            tracks: tracks || []
          });
        }
      );
    }
  );
});

app.post('/api/playlists/:playlistId/cover', verifyToken, async (req, res) => {
  const userId = req.user.userId;
  const username = req.user.username;
  const playlistId = Number(req.params.playlistId);
  if (!Number.isFinite(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist id' });
  }

  const rawFileName = decodeHeaderValue(req.headers['x-file-name']) || 'playlist-cover';
  const safeFileName = sanitizeUploadFileName(rawFileName);
  const mimeType = String(req.headers['content-type'] || 'application/octet-stream').toLowerCase();
  const ext = resolvePlaylistCoverExtension(mimeType, safeFileName);
  if (!ext) {
    return res.status(400).json({ error: 'Unsupported image format. Allowed: jpg, png, webp, gif, avif' });
  }

  let tempFilePath = '';
  let newStoredName = '';

  try {
    const playlist = await dbGetAsync(
      'SELECT id, user_id, cover_path FROM playlists WHERE id = ?',
      [playlistId]
    );
    if (!playlist || Number(playlist.user_id) !== Number(userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const coverDir = await ensureUserPlaylistCoverDir(userId, username);
    tempFilePath = path.join(coverDir, `cover-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    const writeStream = fs.createWriteStream(tempFilePath, { flags: 'wx' });
    let fileSize = 0;
    let streamErrored = false;

    await new Promise((resolve, reject) => {
      req.on('data', (chunk) => {
        fileSize += chunk.length;
        if (fileSize > PLAYLIST_COVER_MAX_BYTES) {
          streamErrored = true;
          reject(new Error('File too large'));
          req.destroy();
          writeStream.destroy();
          return;
        }
      });
      req.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', () => {
        if (!streamErrored) resolve();
      });
      req.pipe(writeStream);
    });

    if (!fs.existsSync(tempFilePath)) {
      return res.status(500).json({ error: 'Cover upload stream failed' });
    }

    const stat = await fsp.stat(tempFilePath);
    if (!stat.size) {
      await fsp.unlink(tempFilePath).catch(() => {});
      return res.status(400).json({ error: 'Empty image upload is not allowed' });
    }

    newStoredName = `playlist-${playlistId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const finalPath = path.join(coverDir, newStoredName);
    await fsp.rename(tempFilePath, finalPath);
    tempFilePath = '';

    await dbRunAsync('UPDATE playlists SET cover_path = ? WHERE id = ? AND user_id = ?', [newStoredName, playlistId, userId]);

    const oldCoverPath = String(playlist.cover_path || '').trim();
    if (oldCoverPath && oldCoverPath !== newStoredName) {
      const safeOldName = path.basename(oldCoverPath);
      const oldAbsolutePath = path.join(coverDir, safeOldName);
      await fsp.unlink(oldAbsolutePath).catch(() => {});
    }

    res.status(201).json({
      playlist_id: playlistId,
      cover_path: newStoredName,
      cover_url: buildPlaylistCoverUrl(playlistId),
      max_size_bytes: PLAYLIST_COVER_MAX_BYTES
    });
  } catch (error) {
    if (tempFilePath) {
      await fsp.unlink(tempFilePath).catch(() => {});
    }
    if (newStoredName) {
      const coverDir = buildUserPlaylistCoverDir(userId, username);
      const uploadedPath = path.join(coverDir, path.basename(newStoredName));
      await fsp.unlink(uploadedPath).catch(() => {});
    }
    const isTooLarge = String(error?.message || '').toLowerCase().includes('too large');
    console.error('[UPLOAD] Playlist cover upload error:', error);
    res.status(isTooLarge ? 413 : 500).json({
      error: isTooLarge
        ? `File is too large. Maximum ${Math.floor(PLAYLIST_COVER_MAX_BYTES / (1024 * 1024))}MB`
        : 'Failed to upload playlist cover'
    });
  }
});

app.get('/api/playlists/:playlistId/cover', verifyTokenFlexible, async (req, res) => {
  const userId = req.user.userId;
  const username = req.user.username;
  const playlistId = Number(req.params.playlistId);
  if (!Number.isFinite(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist id' });
  }

  try {
    const playlist = await dbGetAsync(
      'SELECT id, user_id, cover_path FROM playlists WHERE id = ?',
      [playlistId]
    );
    if (!playlist || Number(playlist.user_id) !== Number(userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const coverPath = String(playlist.cover_path || '').trim();
    if (!coverPath) {
      return res.status(404).json({ error: 'Playlist cover not found' });
    }

    const safeFileName = path.basename(coverPath);
    const absolutePath = path.join(buildUserPlaylistCoverDir(userId, username), safeFileName);
    await fsp.access(absolutePath, fs.constants.R_OK);

    res.setHeader('Content-Type', getPlaylistCoverMimeType(safeFileName));
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(absolutePath, (sendErr) => {
      if (sendErr) {
        console.error('[STREAM] Failed to send playlist cover:', sendErr);
        if (!res.headersSent) {
          res.status(sendErr.statusCode || 500).json({ error: 'Cover stream failed' });
        }
      }
    });
  } catch (error) {
    console.error('[STREAM] Playlist cover access error:', error);
    res.status(404).json({ error: 'Playlist cover not found' });
  }
});

// ADD track to playlist
app.post('/api/playlists/:playlistId/tracks', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const playlistId = req.params.playlistId;
  const {
    track_title,
    track_artist,
    track_album,
    track_duration,
    track_source,
    local_track_id,
    navidrome_id,
    cover_art_id,
    track_url
  } = req.body;

  // Verify playlist belongs to user
  db.get(
    'SELECT user_id FROM playlists WHERE id = ?',
    [playlistId],
    (err, playlist) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!playlist || playlist.user_id !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      db.run(
        `INSERT INTO playlist_tracks 
         (playlist_id, user_id, track_title, track_artist, track_album, track_duration, track_source, local_track_id, navidrome_id, cover_art_id, track_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [playlistId, userId, track_title, track_artist, track_album, track_duration, track_source, local_track_id, navidrome_id, cover_art_id, track_url],
        function(err) {
          if (err) {
            console.error('Insert error:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          res.status(201).json({
            id: this.lastID,
            playlist_id: playlistId,
            track_title,
            track_artist,
            track_album,
            track_duration,
            track_source,
            local_track_id,
            navidrome_id,
            cover_art_id,
            track_url
          });
        }
      );
    }
  );
});

app.get('/api/user/local-tracks', verifyToken, (req, res) => {
  const userId = req.user.userId;
  db.all(
    `SELECT id, title, artist, album, duration, mime_type, original_file_name, cover_data, file_size
     FROM user_local_tracks
     WHERE user_id = ?
     ORDER BY updated_at DESC, id DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        console.error('[DB] Error fetching local tracks:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      const tracks = (rows || []).map((row) => ({
        ...row,
        track_url: buildLocalTrackUrl(row.id),
        local_track_id: row.id
      }));

      res.json(tracks);
    }
  );
});

app.post('/api/user/local-tracks/upload', verifyToken, async (req, res) => {
  const userId = req.user.userId;
  const username = req.user.username;
  const meta = parseTrackMeta(req);
  const rawFileName = decodeHeaderValue(req.headers['x-file-name']) || meta.fileName || 'track.bin';
  const safeFileName = sanitizeUploadFileName(rawFileName);
  const ext = path.extname(safeFileName).toLowerCase().slice(0, 16);
  const mimeType = String(req.headers['content-type'] || meta.mime_type || 'application/octet-stream');
  const fallbackTitle = path.basename(safeFileName, path.extname(safeFileName)) || 'Untitled';

  let tempFilePath = '';
  let fileHash = '';
  let fileSize = 0;

  try {
    const userDir = await ensureUserMediaDir(userId, username);
    tempFilePath = path.join(userDir, `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    const writeStream = fs.createWriteStream(tempFilePath, { flags: 'wx' });
    const hash = crypto.createHash('sha256');
    let streamErrored = false;

    await new Promise((resolve, reject) => {
      req.on('data', (chunk) => {
        fileSize += chunk.length;
        if (fileSize > MAX_UPLOAD_BYTES) {
          streamErrored = true;
          reject(new Error('File too large'));
          req.destroy();
          writeStream.destroy();
          return;
        }
        hash.update(chunk);
      });
      req.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', () => {
        if (!streamErrored) resolve();
      });
      req.pipe(writeStream);
    });

    if (!fileSize) {
      await fsp.unlink(tempFilePath).catch(() => {});
      return res.status(400).json({ error: 'Empty file upload is not allowed' });
    }

    fileHash = hash.digest('hex');
    const storedFileName = `${fileHash}${ext || ''}`;
    const finalPath = path.join(userDir, storedFileName);

    try {
      await fsp.access(finalPath, fs.constants.F_OK);
      await fsp.unlink(tempFilePath).catch(() => {});
    } catch (e) {
      await fsp.rename(tempFilePath, finalPath);
    }

    const title = String(meta.title || fallbackTitle);
    const artist = String(meta.artist || '');
    const album = String(meta.album || '');
    const duration = Number(meta.duration || 0) || 0;
    const coverData = typeof meta.cover_data === 'string' ? meta.cover_data : '';
    const originalFileName = safeFileName;

    db.run(
      `INSERT INTO user_local_tracks
       (user_id, file_hash, original_file_name, stored_file_name, mime_type, file_size, title, artist, album, duration, cover_data, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, file_hash) DO UPDATE SET
         original_file_name = excluded.original_file_name,
         stored_file_name = excluded.stored_file_name,
         mime_type = excluded.mime_type,
         file_size = excluded.file_size,
         title = excluded.title,
         artist = excluded.artist,
         album = excluded.album,
         duration = excluded.duration,
         cover_data = excluded.cover_data,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, fileHash, originalFileName, storedFileName, mimeType, fileSize, title, artist, album, duration, coverData],
      (insertErr) => {
        if (insertErr) {
          console.error('[DB] Error storing local upload metadata:', insertErr);
          return res.status(500).json({ error: 'Internal server error' });
        }

        db.get(
          `SELECT id, title, artist, album, duration, mime_type, original_file_name, cover_data, file_size
           FROM user_local_tracks
           WHERE user_id = ? AND file_hash = ?`,
          [userId, fileHash],
          (selectErr, row) => {
            if (selectErr) {
              console.error('[DB] Error fetching uploaded local track:', selectErr);
              return res.status(500).json({ error: 'Internal server error' });
            }
            if (!row) {
              return res.status(500).json({ error: 'Upload saved but track metadata not found' });
            }

            res.status(201).json({
              ...row,
              track_url: buildLocalTrackUrl(row.id),
              local_track_id: row.id
            });
          }
        );
      }
    );
  } catch (error) {
    if (tempFilePath) {
      await fsp.unlink(tempFilePath).catch(() => {});
    }
    const status = String(error.message || '').includes('too large') ? 413 : 500;
    const message = status === 413 ? 'File is too large' : 'Failed to upload local track';
    console.error('[UPLOAD] Local track upload error:', error);
    res.status(status).json({ error: message });
  }
});

app.get('/api/user/local-tracks/:trackId/stream', verifyTokenFlexible, async (req, res) => {
  const userId = req.user.userId;
  const username = req.user.username;
  const trackId = Number(req.params.trackId);
  if (!Number.isFinite(trackId)) {
    return res.status(400).json({ error: 'Invalid track id' });
  }

  db.get(
    `SELECT id, stored_file_name, mime_type, original_file_name
     FROM user_local_tracks
     WHERE id = ? AND user_id = ?`,
    [trackId, userId],
    async (err, row) => {
      if (err) {
        console.error('[DB] Error fetching local track for streaming:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      if (!row) {
        return res.status(404).json({ error: 'Track not found' });
      }

      const userDir = buildUserMediaDir(userId, username);
      const absolutePath = path.join(userDir, row.stored_file_name || '');

      try {
        await fsp.access(absolutePath, fs.constants.R_OK);
      } catch (e) {
        return res.status(404).json({ error: 'Track file not found' });
      }

      if (row.mime_type) {
        res.setHeader('Content-Type', row.mime_type);
      }
      res.sendFile(absolutePath, (sendErr) => {
        if (sendErr) {
          console.error('[STREAM] Failed to stream local track:', sendErr);
          if (!res.headersSent) {
            res.status(sendErr.statusCode || 500).json({ error: 'Stream failed' });
          }
        }
      });
    }
  );
});

// User settings: media server
app.get('/api/user/settings', verifyToken, (req, res) => {
  const userId = req.user.userId;
  db.get(
    'SELECT navidrome_server, navidrome_user, navidrome_pass FROM users WHERE id = ?',
    [userId],
    (err, row) => {
      if (err) {
        console.error('[DB] Error fetching user settings:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      res.json({
        navidrome_server: row?.navidrome_server || '',
        navidrome_user: row?.navidrome_user || '',
        navidrome_pass: row?.navidrome_pass || ''
      });
    }
  );
});

app.put('/api/user/settings', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const { navidrome_server, navidrome_user, navidrome_pass } = req.body || {};
  db.run(
    'UPDATE users SET navidrome_server = ?, navidrome_user = ?, navidrome_pass = ? WHERE id = ?',
    [navidrome_server || '', navidrome_user || '', navidrome_pass || '', userId],
    function(err) {
      if (err) {
        console.error('[DB] Error updating user settings:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      res.json({ success: true });
    }
  );
});

// REMOVE track from playlist
app.delete('/api/playlists/:playlistId/tracks/:trackId', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const playlistId = req.params.playlistId;
  const trackId = req.params.trackId;

  // Verify playlist belongs to user
  db.get(
    'SELECT user_id FROM playlists WHERE id = ?',
    [playlistId],
    (err, playlist) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!playlist || playlist.user_id !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      db.run(
        'DELETE FROM playlist_tracks WHERE id = ? AND playlist_id = ?',
        [trackId, playlistId],
        function(err) {
          if (err) {
            console.error('Delete error:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          res.json({ message: 'Track removed from playlist' });
        }
      );
    }
  );
});

// DELETE playlist
app.delete('/api/playlists/:playlistId', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const playlistId = req.params.playlistId;

  // Verify playlist belongs to user
  db.get(
    'SELECT user_id, cover_path FROM playlists WHERE id = ?',
    [playlistId],
    (err, playlist) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!playlist || playlist.user_id !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      db.run(
        'DELETE FROM playlists WHERE id = ?',
        [playlistId],
        async function(err) {
          if (err) {
            console.error('Delete error:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          const coverPath = String(playlist.cover_path || '').trim();
          if (coverPath) {
            const safeFileName = path.basename(coverPath);
            const absolutePath = path.join(buildUserPlaylistCoverDir(userId, req.user.username), safeFileName);
            await fsp.unlink(absolutePath).catch(() => {});
          }

          res.json({ message: 'Playlist deleted' });
        }
      );
    }
  );
});

// RENAME playlist
app.patch('/api/playlists/:playlistId', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const playlistId = req.params.playlistId;
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Playlist name is required' });
  }

  db.get(
    'SELECT user_id, cover_path FROM playlists WHERE id = ?',
    [playlistId],
    (err, playlist) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!playlist || playlist.user_id !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      db.run(
        'UPDATE playlists SET name = ? WHERE id = ?',
        [name, playlistId],
        function(err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
              return res.status(400).json({ error: 'Playlist with this name already exists' });
            }
            console.error('Update error:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          res.json({
            id: playlistId,
            name: name,
            cover_path: String(playlist.cover_path || ''),
            cover_url: playlist.cover_path ? buildPlaylistCoverUrl(playlistId) : '',
            message: 'Playlist renamed'
          });
        }
      );
    }
  );
});

// AI playlist creation
app.post('/api/ai/create-playlist', verifyToken, async (req, res) => {
  const userId = req.user.userId;
  const body = req.body || {};
  const prompt = String(body.prompt || body.request || '').trim();

  if (!prompt && !body.genre && !body.genres && !body.artists && !body.playlistName && !body.name) {
    return res.status(400).json({ error: 'Prompt, genre, or artists are required' });
  }

  try {
    const parsed = await parsePlaylistRequestWithAI(prompt, {
      playlistName: body.playlistName || body.name,
      genres: body.genres || body.genre,
      artists: body.artists,
      trackCount: body.trackCount || body.count
    });

    const requestPlan = {
      prompt,
      mood: parsed.mood || '',
      genres: normalizeTagList(parsed.genres || body.genres || body.genre),
      artists: normalizeTagList(parsed.artists || body.artists),
      trackCount: clampNumber(
        parsed.trackCount || body.trackCount || body.count || extractRequestedTrackCount(prompt),
        AI_PLAYLIST_MIN_TRACK_COUNT,
        AI_PLAYLIST_MAX_TRACK_COUNT,
        AI_PLAYLIST_DEFAULT_TRACK_COUNT
      )
    };

    let baseName = String(parsed.playlistName || body.playlistName || body.name || '').trim();
    if (!baseName) {
      const firstGenre = requestPlan.genres[0];
      const firstArtist = requestPlan.artists[0];
      baseName = firstGenre
        ? `AI ${firstGenre} Mix`
        : (firstArtist ? `AI ${firstArtist} Set` : 'AI Playlist');
    }
    const playlistName = await ensureUniquePlaylistName(userId, baseName);

    let candidates = normalizeCandidateTracksFromBody(
      body.candidateTracks,
      Math.max(120, Math.min(3200, requestPlan.trackCount * 8))
    );
    if (!candidates.length) {
      const userSettings = await dbGetAsync(
        'SELECT navidrome_server, navidrome_user, navidrome_pass FROM users WHERE id = ?',
        [userId]
      );
      const navidromeConfig = resolveRequestNavidromeConfig(userSettings, body);
      candidates = await fetchCandidateTracks(navidromeConfig, {
        artists: requestPlan.artists,
        genres: requestPlan.genres,
        prompt: prompt || requestPlan.mood,
        limit: Math.max(80, Math.min(3200, requestPlan.trackCount * 6))
      });
    }

    if (!candidates.length) {
      return res.status(404).json({ error: 'No candidate songs found in Navidrome' });
    }

    const scored = candidates
      .map((track) => ({
        ...track,
        _score: scoreTrackCandidate(track, requestPlan)
      }))
      .sort((a, b) => b._score - a._score);

    const ranked = await rankTracksWithAI(
      `Create playlist by request "${prompt || requestPlan.mood || playlistName}". Genres: ${requestPlan.genres.join(', ') || 'any'}. Artists: ${requestPlan.artists.join(', ') || 'any'}.`,
      scored,
      requestPlan.trackCount
    );

    const selectedTracks = dedupeTracksById(ranked).slice(0, requestPlan.trackCount);
    if (!selectedTracks.length) {
      return res.status(404).json({ error: 'No suitable tracks found for the playlist' });
    }

    const created = await dbRunAsync(
      'INSERT INTO playlists (user_id, name) VALUES (?, ?)',
      [userId, playlistName]
    );
    const playlistId = created.lastID;

    for (const track of selectedTracks) {
      await dbRunAsync(
        `INSERT INTO playlist_tracks
          (playlist_id, user_id, track_title, track_artist, track_album, track_duration, track_source, local_track_id, navidrome_id, cover_art_id, track_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          playlistId,
          userId,
          track.title || 'Unknown',
          track.artist || '',
          track.album || '',
          Number(track.duration || 0) || 0,
          'navidrome',
          null,
          track.navidrome_id || null,
          track.cover_art_id || null,
          track.track_url || null
        ]
      );
    }

    res.status(201).json({
      playlistId,
      playlistName,
      tracksAdded: selectedTracks.length,
      aiUsed: !!GROQ_API_KEY,
      request: requestPlan,
      tracks: selectedTracks.map((track) => ({
        navidrome_id: track.navidrome_id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        genre: track.genre,
        duration: track.duration,
        cover_art_id: track.cover_art_id,
        track_url: track.track_url
      }))
    });
  } catch (error) {
    console.error('[AI] Failed to create playlist:', error);
    res.status(500).json({ error: 'Failed to create AI playlist', details: error.message });
  }
});

// AI add tracks to existing playlist (does not create a new playlist)
app.post('/api/ai/playlist-add-tracks', verifyToken, async (req, res) => {
  const userId = req.user.userId;
  const body = req.body || {};
  const prompt = String(body.prompt || body.request || '').trim();
  const excludeIds = toArray(body.excludeIds).map((id) => String(id || '').trim()).filter(Boolean);
  const seedTracks = toArray(body.seedTracks).map((track) => ({
    title: String(track?.title || ''),
    artist: String(track?.artist || ''),
    album: String(track?.album || ''),
    genre: String(track?.genre || ''),
    navidrome_id: String(track?.navidrome_id || track?.navidromeId || '')
  }));

  if (!prompt && !seedTracks.length && !body.genres && !body.genre && !body.artists) {
    return res.status(400).json({ error: 'Prompt or seed tracks are required' });
  }

  try {
    const requestedCount = body.trackCount || body.count || extractRequestedTrackCount(prompt);
    const fallbackCount = Math.max(8, Math.min(24, seedTracks.length || 12));
    const parsed = await parsePlaylistRequestWithAI(prompt, {
      genres: body.genres || body.genre,
      artists: body.artists,
      trackCount: requestedCount || fallbackCount
    });

    const seedArtists = normalizeTagList(seedTracks.map((track) => track.artist).filter(Boolean), 8);
    const seedGenres = normalizeTagList(seedTracks.map((track) => track.genre).filter(Boolean), 8);
    const seedAlbums = normalizeTagList(seedTracks.map((track) => track.album).filter(Boolean), 10);

    const requestPlan = {
      prompt,
      mood: String(parsed.mood || '').trim(),
      artists: normalizeTagList([...(parsed.artists || []), ...seedArtists], 8),
      genres: normalizeTagList([...(parsed.genres || []), ...seedGenres], 8),
      albums: seedAlbums,
      trackCount: clampNumber(
        parsed.trackCount || requestedCount,
        AI_PLAYLIST_MIN_TRACK_COUNT,
        AI_PLAYLIST_MAX_TRACK_COUNT,
        fallbackCount
      )
    };

    let candidates = normalizeCandidateTracksFromBody(
      body.candidateTracks,
      Math.max(120, Math.min(3200, requestPlan.trackCount * 10))
    );
    if (!candidates.length) {
      const userSettings = await dbGetAsync(
        'SELECT navidrome_server, navidrome_user, navidrome_pass FROM users WHERE id = ?',
        [userId]
      );
      const navidromeConfig = resolveRequestNavidromeConfig(userSettings, body);
      const seedPromptHint = seedTracks
        .slice(0, 5)
        .map((track) => `${track.artist} ${track.album} ${track.genre}`.trim())
        .filter(Boolean)
        .join(' ');
      candidates = await fetchCandidateTracks(navidromeConfig, {
        artists: requestPlan.artists,
        genres: requestPlan.genres,
        prompt: prompt || requestPlan.mood || seedPromptHint,
        limit: Math.max(80, Math.min(3200, requestPlan.trackCount * 7))
      });
    }

    candidates = dedupeTracksById(candidates, excludeIds);
    if (!candidates.length) {
      return res.json({ tracks: [], aiUsed: !!GROQ_API_KEY, request: requestPlan });
    }

    const scored = candidates
      .map((track) => ({
        ...track,
        _score: scoreTrackCandidate(track, requestPlan)
      }))
      .sort((a, b) => b._score - a._score);

    const ranked = await rankTracksWithAI(
      `Add tracks to existing playlist. Prompt: "${prompt || requestPlan.mood || 'n/a'}". Existing artists: ${seedArtists.join(', ') || 'none'}. Existing genres: ${seedGenres.join(', ') || 'none'}. Existing albums: ${seedAlbums.join(', ') || 'none'}.`,
      scored,
      requestPlan.trackCount
    );

    const selectedTracks = dedupeTracksById(ranked, excludeIds).slice(0, requestPlan.trackCount);
    res.json({
      tracks: selectedTracks.map((track) => ({
        navidrome_id: track.navidrome_id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        genre: track.genre,
        duration: track.duration,
        cover_art_id: track.cover_art_id,
        track_url: track.track_url
      })),
      tracksSuggested: selectedTracks.length,
      aiUsed: !!GROQ_API_KEY,
      request: requestPlan
    });
  } catch (error) {
    console.error('[AI] Failed to suggest playlist tracks:', error);
    res.status(500).json({ error: 'Failed to generate tracks for playlist', details: error.message });
  }
});

// AI smart shuffle
app.post('/api/ai/smart-shuffle', verifyToken, async (req, res) => {
  const userId = req.user.userId;
  const body = req.body || {};
  const limit = clampNumber(body.limit, 1, 25, 8);
  const excludeIds = toArray(body.excludeIds).map((id) => String(id || '').trim()).filter(Boolean);
  const seedTracks = toArray(body.seedTracks).map((track) => ({
    title: String(track?.title || ''),
    artist: String(track?.artist || ''),
    album: String(track?.album || ''),
    genre: String(track?.genre || ''),
    navidrome_id: String(track?.navidrome_id || track?.navidromeId || '')
  }));

  try {
    const artists = normalizeTagList(seedTracks.map((track) => track.artist).filter(Boolean), 6);
    const genres = normalizeTagList(seedTracks.map((track) => track.genre).filter(Boolean), 6);
    const albums = normalizeTagList(seedTracks.map((track) => track.album).filter(Boolean), 6);
    const promptHint = seedTracks
      .slice(0, 4)
      .map((track) => `${track.artist} ${track.album} ${track.genre}`.trim())
      .filter(Boolean)
      .join(' ');

    let candidates = normalizeCandidateTracksFromBody(body.candidateTracks, Math.max(120, limit * 14));
    if (!candidates.length) {
      const userSettings = await dbGetAsync(
        'SELECT navidrome_server, navidrome_user, navidrome_pass FROM users WHERE id = ?',
        [userId]
      );
      const navidromeConfig = resolveRequestNavidromeConfig(userSettings, body);
      candidates = await fetchCandidateTracks(navidromeConfig, {
        artists,
        genres,
        prompt: promptHint,
        limit: Math.max(40, limit * 6)
      });
      candidates = dedupeTracksById(candidates, excludeIds);

      if (!candidates.length) {
        const payload = await navidromeRequest(navidromeConfig, 'getRandomSongs.view', { size: Math.max(20, limit * 3) });
        const randomTracks = toArray(payload?.randomSongs?.song).map((song) => mapNavidromeSong(navidromeConfig, song)).filter(Boolean);
        candidates = dedupeTracksById(randomTracks, excludeIds);
      }
    } else {
      candidates = dedupeTracksById(candidates, excludeIds);
    }

    if (!candidates.length) {
      return res.json({ tracks: [], aiUsed: !!GROQ_API_KEY });
    }

    const scored = candidates
      .map((track) => ({
        ...track,
        _score: scoreTrackCandidate(track, {
          artists,
          genres,
          albums,
          mood: '',
          prompt: promptHint
        })
      }))
      .sort((a, b) => b._score - a._score);

    const ranked = await rankTracksWithAI(
      `Smart shuffle continuation. Seed artists: ${artists.join(', ') || 'none'}. Seed albums: ${albums.join(', ') || 'none'}. Seed genres: ${genres.join(', ') || 'none'}.`,
      scored,
      limit
    );

    const selectedTracks = dedupeTracksById(ranked, excludeIds).slice(0, limit);
    res.json({
      tracks: selectedTracks.map((track) => ({
        navidrome_id: track.navidrome_id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        genre: track.genre,
        duration: track.duration,
        cover_art_id: track.cover_art_id,
        track_url: track.track_url
      })),
      aiUsed: !!GROQ_API_KEY
    });
  } catch (error) {
    console.error('[AI] Smart shuffle failed:', error);
    res.status(500).json({ error: 'Smart shuffle failed', details: error.message });
  }
});

// Navidrome Search Proxy
app.get('/api/navidrome/search', (req, res) => {
  const query = req.query.q;
  
  if (!query) {
    return res.status(400).json({ error: 'Search query required' });
  }

  const navidromeUrl = `https://music.youtubemusicdownloader.life/api/search?q=${encodeURIComponent(query)}`;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  // Proxy the request to Navidrome
  fetch(navidromeUrl, {
    headers: {
      'Accept': 'application/json'
    },
    signal: controller.signal
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Navidrome error: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      res.json(data);
    })
    .catch(error => {
      console.error('[PROXY] Navidrome search error:', error);
      res.status(500).json({ error: 'Search failed', details: error.message });
    })
    .finally(() => {
      clearTimeout(timeout);
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Debug endpoint to check database tables (dev only)
if (isDev) {
  app.get('/api/debug/tables', (req, res) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ tables: tables.map(t => t.name) });
    });
  });
}

// Serve static files (avoid exposing server/db/env files)
const staticOptions = {
  setHeaders: (res, filepath) => {
    const cacheHeader = isDev ? 'no-store' : 'public, max-age=3600';
    if (filepath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
      res.setHeader('Cache-Control', cacheHeader);
    } else if (filepath.endsWith('.ts')) {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'no-store');
    } else if (filepath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filepath.endsWith('.jpg') || filepath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filepath.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    }
  }
};
app.use('/css', express.static(path.join(PROJECT_ROOT, 'css'), staticOptions));
app.use('/assets', express.static(path.join(PROJECT_ROOT, 'assets'), staticOptions));
app.use('/ts', express.static(path.join(PROJECT_ROOT, 'src', 'client'), staticOptions));
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', isDev ? 'no-store' : 'public, max-age=3600');
  res.sendFile(path.join(PROJECT_ROOT, 'manifest.json'));
});
app.get('/offline.html', (req, res) => {
  res.setHeader('Cache-Control', isDev ? 'no-store' : 'public, max-age=3600');
  res.sendFile(path.join(PROJECT_ROOT, 'offline.html'));
});
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(PROJECT_ROOT, 'sw.js'));
});

// 404 handler for API routes that weren't matched
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Fallback to index.html for SPA routing (MUST be last)
app.get('*', (req, res) => {
  res.sendFile(path.join(PROJECT_ROOT, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
