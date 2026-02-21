// @ts-nocheck
/**
 * Server Playlist Manager Module
 * Handles synchronization of playlists between local IndexedDB and the server
 */

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001'
  : window.location.origin;

console.log('[SERVER-PLAYLIST] API Base URL:', API_BASE_URL);
console.log('[SERVER-PLAYLIST] Window hostname:', window.location.hostname);
console.log('[SERVER-PLAYLIST] Window origin:', window.location.origin);

/**
 * Get authorization header with JWT token
 */
function getAuthHeader() {
  const token = localStorage.getItem('auth_token');
  if (!token) {
    throw new Error('No authentication token found');
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

function getAuthToken() {
  const token = localStorage.getItem('auth_token');
  if (!token) {
    throw new Error('No authentication token found');
  }
  return token;
}

function getNavidromeSettingsFromClient() {
  const server = (localStorage.getItem('navidromeServer') || '').trim();
  const user = (localStorage.getItem('navidromeUser') || '').trim();
  const pass = (localStorage.getItem('navidromePass') || '').trim();
  return {
    server,
    user,
    pass
  };
}

function normalizeTrackUrl(url) {
  if (!url) return '';
  const raw = String(url);
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${API_BASE_URL}${raw}`;
  return raw;
}

function appendAuthTokenToUrl(url) {
  const normalized = String(url || '').trim();
  if (!normalized || normalized.startsWith('data:')) return normalized;
  const token = localStorage.getItem('auth_token');
  if (!token) return normalized;
  try {
    const base = window.location?.origin || API_BASE_URL;
    const parsed = new URL(normalized, base);
    parsed.searchParams.set('token', token);
    if (!/^https?:\/\//i.test(normalized) && normalized.startsWith('/')) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch (error) {
    return normalized;
  }
}

function normalizePlaylistCoverUrl(url) {
  return appendAuthTokenToUrl(normalizeTrackUrl(url));
}

function normalizeServerPlaylist(playlist) {
  const coverUrl = normalizePlaylistCoverUrl(playlist?.cover_url || playlist?.cover || '');
  return {
    ...(playlist || {}),
    cover_url: coverUrl,
    cover: coverUrl
  };
}

function encodeMetaHeader(metadata) {
  try {
    return encodeURIComponent(JSON.stringify(metadata || {}));
  } catch (error) {
    console.warn('[SERVER-PLAYLIST] Failed to encode local track metadata:', error);
    return encodeURIComponent('{}');
  }
}

function getServerLocalTrackKey(track) {
  if (!track) return '';
  if (track.local_track_id !== undefined && track.local_track_id !== null && track.local_track_id !== '') {
    return `id:${String(track.local_track_id)}`;
  }
  if (track.track_url) {
    return `url:${String(track.track_url)}`;
  }
  return '';
}

function getLocalSongSyncKey(song) {
  if (!song) return '';
  if (song.serverTrackId !== undefined && song.serverTrackId !== null && song.serverTrackId !== '') {
    return `id:${String(song.serverTrackId)}`;
  }
  if (song.remoteUrl) {
    return `url:${String(song.remoteUrl)}`;
  }
  return '';
}

function toNumber(value) {
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/**
 * Check if user is authenticated
 */
export function isUserAuthenticated() {
  return !!localStorage.getItem('auth_token');
}

/**
 * Fetch user's local music tracks from server
 */
export async function fetchServerLocalTracks() {
  try {
    if (!isUserAuthenticated()) return [];

    const response = await fetch(`${API_BASE_URL}/api/user/local-tracks`, {
      method: 'GET',
      headers: getAuthHeader()
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('auth_token');
        return [];
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const tracks = await response.json();
    return Array.isArray(tracks) ? tracks : [];
  } catch (error) {
    console.error('[SERVER-PLAYLIST] Error fetching server local tracks:', error);
    return [];
  }
}

/**
 * Upload a local audio file to server storage for this account
 */
export async function uploadServerLocalTrack(fileBlob, metadata = {}, fileName = '') {
  if (!isUserAuthenticated()) {
    throw new Error('User not authenticated');
  }
  if (!fileBlob) {
    throw new Error('File blob is required for upload');
  }

  const token = getAuthToken();
  const safeName = String(fileName || metadata.fileName || 'track.bin');

  const response = await fetch(`${API_BASE_URL}/api/user/local-tracks/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': fileBlob.type || metadata.mime_type || 'application/octet-stream',
      'X-Track-Meta': encodeMetaHeader(metadata),
      'X-File-Name': encodeURIComponent(safeName)
    },
    body: fileBlob
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch (e) {
      // Ignore JSON parse error and keep generic message
    }
    throw new Error(message);
  }

  const uploaded = await response.json();
  uploaded.track_url = normalizeTrackUrl(uploaded.track_url);
  return uploaded;
}

async function upsertLocalSongFromServerTrack(serverTrack, db) {
  if (!serverTrack) return null;

  const serverTrackId = toNumber(serverTrack.id);
  const localTrackId = toNumber(serverTrack.local_track_id);
  const trackUrl = normalizeTrackUrl(serverTrack.track_url);

  if (!localTrackId && !trackUrl) return null;

  let song = null;
  if (localTrackId !== null) {
    song = await db.songs.where('serverTrackId').equals(localTrackId).first();
  }

  if (!song && trackUrl) {
    song = await db.songs.toCollection().filter(item => item.source === 'local' && item.remoteUrl === trackUrl).first();
  }

  const patch = {
    title: serverTrack.track_title || serverTrack.title || '',
    artist: serverTrack.track_artist || serverTrack.artist || '',
    album: serverTrack.track_album || serverTrack.album || '',
    duration: toNumber(serverTrack.track_duration || serverTrack.duration) || 0,
    cover: serverTrack.cover_art_id || serverTrack.cover_data || serverTrack.cover || '',
    source: 'local',
    serverTrackId: localTrackId,
    remoteUrl: trackUrl,
    mimeType: serverTrack.mime_type || '',
    originalFileName: serverTrack.original_file_name || ''
  };

  if (song) {
    await db.songs.update(song.id, patch);
    return { ...song, ...patch };
  }

  const lastSong = await db.songs.orderBy('order').last();
  const nextOrder = Number.isFinite(Number(lastSong?.order)) ? Number(lastSong.order) + 1 : 0;

  const id = await db.songs.add({
    ...patch,
    isFavorite: false,
    order: nextOrder
  });

  return { id, ...patch, isFavorite: false, order: nextOrder };
}

/**
 * Ensure local song exists on server and update IndexedDB with server ids/urls
 */
export async function ensureLocalTrackOnServer(song, db) {
  if (!song || !db || !isUserAuthenticated()) return song;
  if (song.source === 'navidrome') return song;

  if (song.serverTrackId && song.remoteUrl) {
    return song;
  }

  if (!song.fileBlob) {
    return song;
  }

  try {
    const uploaded = await uploadServerLocalTrack(
      song.fileBlob,
      {
        title: song.title || '',
        artist: song.artist || '',
        album: song.album || '',
        duration: toNumber(song.duration) || 0,
        // Do not send cover_data in headers; it can exceed header limits (431).
        mime_type: song.mimeType || song.fileBlob?.type || ''
      },
      song.originalFileName || song.fileBlob?.name || `${song.title || 'track'}.mp3`
    );

    const updatePatch = {
      serverTrackId: toNumber(uploaded.id),
      remoteUrl: normalizeTrackUrl(uploaded.track_url),
      title: uploaded.title || song.title,
      artist: uploaded.artist || song.artist,
      album: uploaded.album || song.album,
      duration: toNumber(uploaded.duration) || song.duration || 0,
      cover: uploaded.cover_data || song.cover,
      mimeType: uploaded.mime_type || song.mimeType || song.fileBlob?.type || '',
      originalFileName: uploaded.original_file_name || song.originalFileName || song.fileBlob?.name || ''
    };

    if (song.id !== undefined && song.id !== null) {
      await db.songs.update(song.id, updatePatch);
    }

    return { ...song, ...updatePatch };
  } catch (error) {
    console.error('[SERVER-PLAYLIST] Failed to upload local track to server:', error);
    return song;
  }
}

/**
 * Pull account local tracks metadata from server into local IndexedDB
 */
export async function syncLocalLibraryFromServer(db) {
  if (!isUserAuthenticated()) return [];
  if (!db?.songs) return [];

  const serverTracks = await fetchServerLocalTracks();
  const synced = [];

  for (const serverTrack of serverTracks) {
    try {
      const upserted = await upsertLocalSongFromServerTrack(serverTrack, db);
      if (upserted) synced.push(upserted);
    } catch (error) {
      console.error('[SERVER-PLAYLIST] Failed to sync local server track to IndexedDB:', error);
    }
  }

  return synced;
}

/**
 * Fetch user's playlists from server
 */
export async function fetchServerPlaylists() {
  try {
    if (!isUserAuthenticated()) {
      console.log('[SERVER-PLAYLIST] User not authenticated');
      return [];
    }

    const response = await fetch(`${API_BASE_URL}/api/playlists`, {
      method: 'GET',
      headers: getAuthHeader()
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('auth_token');
        console.log('[SERVER-PLAYLIST] Token expired, cleared');
        return [];
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const playlists = await response.json();
    const normalized = Array.isArray(playlists)
      ? playlists.map((playlist) => normalizeServerPlaylist(playlist))
      : [];
    console.log('[SERVER-PLAYLIST] Fetched', normalized.length, 'playlists from server');
    return normalized;
  } catch (error) {
    console.error('[SERVER-PLAYLIST] Error fetching playlists:', error);
    return [];
  }
}

/**
 * Fetch playlist details with tracks
 */
export async function fetchServerPlaylistDetails(playlistId) {
  try {
    if (!isUserAuthenticated()) {
      return null;
    }

    const response = await fetch(`${API_BASE_URL}/api/playlists/${playlistId}`, {
      method: 'GET',
      headers: getAuthHeader()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const playlist = normalizeServerPlaylist(await response.json());
    console.log('[SERVER-PLAYLIST] Fetched playlist:', playlist.name, 'with', playlist.tracks?.length || 0, 'tracks');
    return playlist;
  } catch (error) {
    console.error('[SERVER-PLAYLIST] Error fetching playlist details:', error);
    return null;
  }
}

export async function uploadServerPlaylistCover(playlistId, fileBlob, fileName = '') {
  try {
    if (!isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }
    if (!fileBlob) {
      throw new Error('Cover file is required');
    }

    const token = getAuthToken();
    const safeName = String(fileName || fileBlob.name || 'playlist-cover');

    const response = await fetch(`${API_BASE_URL}/api/playlists/${playlistId}/cover`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': fileBlob.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(safeName)
      },
      body: fileBlob
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const payload = await response.json();
        if (payload?.error) message = payload.error;
      } catch (e) {
        // ignore parse errors
      }
      throw new Error(message);
    }

    const data = await response.json();
    const coverUrl = normalizePlaylistCoverUrl(data?.cover_url || '');
    return {
      ...(data || {}),
      cover_url: coverUrl,
      cover: coverUrl
    };
  } catch (error) {
    console.error('[SERVER-PLAYLIST] Error uploading playlist cover:', error);
    throw error;
  }
}

/**
 * Create new playlist on server
 */
export async function createServerPlaylist(name) {
  try {
    if (!isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/api/playlists`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ name })
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.substring(0, 100)}`);
    }

    const playlist = await response.json();
    console.log('[SERVER-PLAYLIST] Created playlist on server:', playlist.name);
    return playlist;
  } catch (error) {
    console.error('[SERVER-PLAYLIST] Error creating playlist:', error);
    throw error;
  }
}

/**
 * Delete playlist from server
 */
export async function deleteServerPlaylist(playlistId) {
  try {
    if (!isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/api/playlists/${playlistId}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    console.log('[SERVER-PLAYLIST] Deleted playlist from server:', playlistId);
    return true;
  } catch (error) {
    console.error('[SERVER-PLAYLIST] Error deleting playlist:', error);
    throw error;
  }
}

/**
 * Rename playlist on server
 */
export async function renameServerPlaylist(playlistId, newName) {
  try {
    if (!isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/api/playlists/${playlistId}`, {
      method: 'PATCH',
      headers: getAuthHeader(),
      body: JSON.stringify({ name: newName })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    console.log('[SERVER-PLAYLIST] Renamed playlist on server:', playlistId);
    return true;
  } catch (error) {
    console.error('[SERVER-PLAYLIST] Error renaming playlist:', error);
    throw error;
  }
}

/**
 * Add track to server playlist
 */
export async function addTrackToServerPlaylist(playlistId, trackData) {
  try {
    if (!isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/api/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(trackData)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const track = await response.json();
    console.log('[SERVER-PLAYLIST] Added track to server playlist:', trackData.track_title);
    return track;
  } catch (error) {
    console.error('[SERVER-PLAYLIST] Error adding track to playlist:', error);
    throw error;
  }
}

/**
 * Remove track from server playlist
 */
export async function removeTrackFromServerPlaylist(playlistId, trackId) {
  try {
    if (!isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/api/playlists/${playlistId}/tracks/${trackId}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    console.log('[SERVER-PLAYLIST] Removed track from server playlist:', trackId);
    return true;
  } catch (error) {
    console.error('[SERVER-PLAYLIST] Error removing track from playlist:', error);
    throw error;
  }
}

export async function createAIPlaylistFromPrompt(payload = {}) {
  try {
    if (!isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/api/ai/create-playlist`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({
        ...(payload || {}),
        navidrome: getNavidromeSettingsFromClient()
      })
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errPayload = await response.json();
        throw new Error(errPayload?.details || errPayload?.error || `HTTP ${response.status}`);
      }
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[SERVER-PLAYLIST] AI create playlist error:', error);
    throw error;
  }
}

export async function fetchAISmartShuffleTracks(payload = {}) {
  try {
    if (!isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/api/ai/smart-shuffle`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({
        ...(payload || {}),
        navidrome: getNavidromeSettingsFromClient()
      })
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errPayload = await response.json();
        throw new Error(errPayload?.details || errPayload?.error || `HTTP ${response.status}`);
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data?.tracks) ? data.tracks : [];
  } catch (error) {
    console.error('[SERVER-PLAYLIST] AI smart shuffle error:', error);
    return [];
  }
}

export async function fetchAITracksForPlaylistPrompt(payload = {}) {
  try {
    if (!isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/api/ai/playlist-add-tracks`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({
        ...(payload || {}),
        navidrome: getNavidromeSettingsFromClient()
      })
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errPayload = await response.json();
        throw new Error(errPayload?.details || errPayload?.error || `HTTP ${response.status}`);
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data?.tracks) ? data.tracks : [];
  } catch (error) {
    console.error('[SERVER-PLAYLIST] AI playlist-add-tracks error:', error);
    throw error;
  }
}

/**
 * Sync local playlists with server (when user logs in)
 */
export async function syncPlaylistsWithServer(localPlaylists, db) {
  if (!isUserAuthenticated()) {
    console.log('[SERVER-PLAYLIST] User not authenticated, skipping sync');
    return;
  }

  try {
    console.log('[SERVER-PLAYLIST] Starting sync...');

    await syncLocalLibraryFromServer(db);

    const serverPlaylists = await fetchServerPlaylists();
    const serverByName = new Map(serverPlaylists.map(p => [p.name, p]));
    const localByName = new Map((localPlaylists || []).map(p => [p.name, p]));

    // Link local playlists to server IDs by name
    for (const local of (localPlaylists || [])) {
      if (!local.serverId && serverByName.has(local.name)) {
        const match = serverByName.get(local.name);
        await db.playlists.update(local.id, {
          serverId: match.id,
          cover: match.cover || ''
        });
        local.serverId = match.id;
        local.cover = match.cover || '';
      }
    }

    // Create server playlists missing from server
    for (const local of (localPlaylists || [])) {
      if (!serverByName.has(local.name)) {
        try {
          const created = await createServerPlaylist(local.name);
          if (created?.id) {
            await db.playlists.update(local.id, { serverId: created.id });
            local.serverId = created.id;
            serverByName.set(local.name, created);
          }
          console.log('[SERVER-PLAYLIST] Created missing playlist on server:', local.name);
        } catch (error) {
          console.error('[SERVER-PLAYLIST] Failed to create playlist:', error);
        }
      }
    }

    // Create local playlists missing from local DB
    for (const serverPl of serverPlaylists) {
      if (!localByName.has(serverPl.name)) {
        try {
          const newId = await db.playlists.add({
            name: serverPl.name,
            songIds: [],
            navidromeSongIds: [],
            navidromeSongs: [],
            cover: serverPl.cover || '',
            serverId: serverPl.id
          });
          console.log('[SERVER-PLAYLIST] Created local playlist from server:', serverPl.name, 'localId:', newId);
        } catch (error) {
          console.error('[SERVER-PLAYLIST] Failed to create local playlist:', error);
        }
      }
    }

    // Refresh local playlists from DB after structural changes
    const mergedLocal = await db.playlists.toArray();

    // Sync tracks (Navidrome + Local) both ways
    for (const local of mergedLocal) {
      const serverId = local.serverId || serverByName.get(local.name)?.id;
      if (!serverId) continue;

      try {
        const details = await fetchServerPlaylistDetails(serverId);
        const serverTracks = details?.tracks || [];

        let localChanged = false;
        const serverCover = String(details?.cover || details?.cover_url || '').trim();
        const localCover = String(local?.cover || '').trim();
        if (serverCover !== localCover) {
          local.cover = serverCover;
          localChanged = true;
        }

        // ----- Navidrome tracks -----
        const serverNavTracks = serverTracks.filter(t => t.track_source === 'navidrome' && (t.navidrome_id || t.track_url));
        const serverNavKeys = new Set(serverNavTracks.map(t => String(t.track_url || t.navidrome_id)));

        const localNavSongs = Array.isArray(local.navidromeSongs) ? local.navidromeSongs.slice() : [];
        const localNavKeys = new Set(localNavSongs.map(t => String(t.url || t.navidromeId)));
        const localNavIds = new Set((local.navidromeSongIds || []).map(id => String(id)));

        // Pull from server -> local (Navidrome)
        for (const track of serverNavTracks) {
          const navId = track.navidrome_id ? String(track.navidrome_id) : '';
          const navUrl = track.track_url || (window.getNavidromeStreamUrl && track.navidrome_id ? window.getNavidromeStreamUrl(track.navidrome_id) : '');
          const key = String(navUrl || navId);
          if (!localNavKeys.has(key)) {
            localNavKeys.add(key);
            if (navId) {
              local.navidromeSongIds = Array.isArray(local.navidromeSongIds) ? local.navidromeSongIds : [];
              if (!localNavIds.has(navId)) {
                localNavIds.add(navId);
                local.navidromeSongIds.push(track.navidrome_id);
              }
            }
            localNavSongs.push({
              navidromeId: track.navidrome_id,
              title: track.track_title || '',
              artist: track.track_artist || '',
              album: track.track_album || '',
              cover: track.cover_art_id || '',
              url: navUrl || '',
              source: 'navidrome'
            });
            localChanged = true;
          }
        }

        // Push from local -> server (Navidrome)
        for (const localTrack of (local.navidromeSongs || [])) {
          const navId = localTrack.navidromeId ? String(localTrack.navidromeId) : '';
          const navUrl = localTrack.url || (window.getNavidromeStreamUrl && localTrack.navidromeId ? window.getNavidromeStreamUrl(localTrack.navidromeId) : '');
          const key = String(navUrl || navId);
          if (key && !serverNavKeys.has(key)) {
            const trackData = {
              track_title: localTrack.title || '',
              track_artist: localTrack.artist || '',
              track_album: localTrack.album || '',
              track_duration: localTrack.duration || 0,
              track_source: 'navidrome',
              navidrome_id: localTrack.navidromeId || null,
              cover_art_id: localTrack.cover || null,
              track_url: navUrl || null
            };
            try {
              await addTrackToServerPlaylist(serverId, trackData);
              console.log('[SERVER-PLAYLIST] Added missing Navidrome track to server playlist:', local.name);
            } catch (error) {
              console.error('[SERVER-PLAYLIST] Failed to add Navidrome track:', error);
            }
          }
        }

        // ----- Local uploaded tracks -----
        local.songIds = Array.isArray(local.songIds) ? local.songIds : [];
        const localSongIdSet = new Set(local.songIds.map(id => Number(id)).filter(id => !Number.isNaN(id)));

        const serverLocalTracks = serverTracks.filter(t => t.track_source === 'local' && (t.local_track_id || t.track_url));
        const serverLocalByKey = new Map();
        serverLocalTracks.forEach(track => {
          const key = getServerLocalTrackKey(track);
          if (key) serverLocalByKey.set(key, track);
        });

        // Pull local tracks from server to local library and playlist
        for (const serverTrack of serverLocalTracks) {
          const localSong = await upsertLocalSongFromServerTrack(serverTrack, db);
          if (!localSong || localSong.id === undefined || localSong.id === null) continue;
          const songId = Number(localSong.id);
          if (Number.isNaN(songId)) continue;

          if (!localSongIdSet.has(songId)) {
            localSongIdSet.add(songId);
            local.songIds.push(songId);
            localChanged = true;
          }
        }

        // Push local playlist songs to server and collect actual local keys
        const localPlaylistKeys = new Set();
        for (const songId of Array.from(localSongIdSet)) {
          const localSong = await db.songs.get(songId);
          if (!localSong || localSong.source === 'navidrome') continue;

          const syncedSong = await ensureLocalTrackOnServer(localSong, db);
          const key = getLocalSongSyncKey(syncedSong);
          if (!key) continue;

          localPlaylistKeys.add(key);

          if (!serverLocalByKey.has(key)) {
            const trackData = {
              track_title: syncedSong.title || '',
              track_artist: syncedSong.artist || '',
              track_album: syncedSong.album || '',
              track_duration: syncedSong.duration || 0,
              track_source: 'local',
              local_track_id: syncedSong.serverTrackId || null,
              navidrome_id: null,
              cover_art_id: syncedSong.cover || null,
              track_url: syncedSong.remoteUrl || null
            };
            try {
              await addTrackToServerPlaylist(serverId, trackData);
              serverLocalByKey.set(key, trackData);
              console.log('[SERVER-PLAYLIST] Added missing local track to server playlist:', local.name);
            } catch (error) {
              console.error('[SERVER-PLAYLIST] Failed to add local track:', error);
            }
          }
        }

        // Remove stale local tracks from server playlist
        for (const serverTrack of serverLocalTracks) {
          const key = getServerLocalTrackKey(serverTrack);
          if (!key) continue;
          if (!localPlaylistKeys.has(key) && serverTrack.id) {
            try {
              await removeTrackFromServerPlaylist(serverId, serverTrack.id);
              console.log('[SERVER-PLAYLIST] Removed stale local track from server playlist:', local.name);
            } catch (error) {
              console.error('[SERVER-PLAYLIST] Failed to remove stale local track:', error);
            }
          }
        }

        if (localChanged) {
          await db.playlists.update(local.id, {
            songIds: Array.from(localSongIdSet),
            navidromeSongIds: local.navidromeSongIds,
            navidromeSongs: localNavSongs,
            cover: String(local.cover || ''),
            serverId
          });
        }
      } catch (error) {
        console.error('[SERVER-PLAYLIST] Track sync error:', error);
      }
    }

    console.log('[SERVER-PLAYLIST] Sync completed');
  } catch (error) {
    console.error('[SERVER-PLAYLIST] Sync error:', error);
  }
}

export default {
  isUserAuthenticated,
  fetchServerPlaylists,
  fetchServerPlaylistDetails,
  createServerPlaylist,
  deleteServerPlaylist,
  renameServerPlaylist,
  addTrackToServerPlaylist,
  removeTrackFromServerPlaylist,
  uploadServerPlaylistCover,
  fetchServerLocalTracks,
  uploadServerLocalTrack,
  ensureLocalTrackOnServer,
  syncLocalLibraryFromServer,
  syncPlaylistsWithServer,
  createAIPlaylistFromPrompt,
  fetchAISmartShuffleTracks,
  fetchAITracksForPlaylistPrompt,
  getAuthHeader
};
