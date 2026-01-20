/**
 * Server Playlist Manager Module
 * Handles synchronization of playlists between local IndexedDB and the server
 */

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `http://localhost:3001`
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
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Check if user is authenticated
 */
export function isUserAuthenticated() {
  return !!localStorage.getItem('auth_token');
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
    console.log('[SERVER-PLAYLIST] Fetched', playlists.length, 'playlists from server');
    return playlists;
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

    const playlist = await response.json();
    console.log('[SERVER-PLAYLIST] Fetched playlist:', playlist.name, 'with', playlist.tracks?.length || 0, 'tracks');
    return playlist;
  } catch (error) {
    console.error('[SERVER-PLAYLIST] Error fetching playlist details:', error);
    return null;
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

    const url = `${API_BASE_URL}/api/playlists`;
    const headers = getAuthHeader();
    const body = JSON.stringify({ name });
    
    console.log('[SERVER-PLAYLIST] Creating playlist:', name);
    console.log('[SERVER-PLAYLIST] URL:', url);
    console.log('[SERVER-PLAYLIST] Headers:', headers);

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: body
    });

    console.log('[SERVER-PLAYLIST] Response status:', response.status);
    console.log('[SERVER-PLAYLIST] Response headers:', response.headers);

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      console.log('[SERVER-PLAYLIST] Content-Type:', contentType);
      
      let errorData;
      if (contentType && contentType.includes('application/json')) {
        errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      } else {
        const text = await response.text();
        console.error('[SERVER-PLAYLIST] Response text:', text.substring(0, 200));
        throw new Error(`HTTP ${response.status}: ${text.substring(0, 100)}`);
      }
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
    
    // Fetch server playlists
    const serverPlaylists = await fetchServerPlaylists();
    const serverPlaylistNames = new Set(serverPlaylists.map(p => p.name));

    // Create playlists on server that exist locally but not on server
    for (const localPlaylist of localPlaylists) {
      if (!serverPlaylistNames.has(localPlaylist.name)) {
        try {
          const created = await createServerPlaylist(localPlaylist.name);
          console.log('[SERVER-PLAYLIST] Created missing playlist on server:', localPlaylist.name);
        } catch (error) {
          console.error('[SERVER-PLAYLIST] Failed to create playlist:', error);
        }
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
  syncPlaylistsWithServer,
  getAuthHeader
};
