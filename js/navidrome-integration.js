/**
 * Navidrome Integration Examples
 * Shows how to use authenticated requests with Navidrome API
 * 
 * Before using these examples:
 * 1. User must be logged in (authenticated)
 * 2. Backend auth server must be running
 * 3. Navidrome API must be accessible
 */

import { 
  navidromeRequest, 
  isAuthenticated, 
  getCurrentUser,
  getAuthHeaders 
} from './auth.js';

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if user can make Navidrome requests
 */
export async function checkNavidromeAccess() {
  if (!isAuthenticated()) {
    console.error('User not authenticated');
    return false;
  }

  try {
    const response = await navidromeRequest('/api/system/ping', { method: 'GET' });
    return response.ok;
  } catch (error) {
    console.error('Navidrome API error:', error);
    return false;
  }
}

/**
 * Show error toast to user
 */
function showError(message) {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  } else {
    console.error(message);
  }
}

/**
 * Show success toast to user
 */
function showSuccess(message) {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = message;
    toast.classList.add('show', 'success');
    setTimeout(() => {
      toast.classList.remove('show', 'success');
    }, 2000);
  } else {
    console.log(message);
  }
}

// ============================================
// MUSIC LIBRARY EXAMPLES
// ============================================

/**
 * Get all songs from Navidrome
 * Endpoint: GET /api/songs
 */
export async function getSongs(options = {}) {
  try {
    const params = new URLSearchParams({
      limit: options.limit || 500,
      offset: options.offset || 0,
      ...options.filters
    });

    const response = await navidromeRequest(`/api/songs?${params}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('Fetched songs:', data);
    return data;
  } catch (error) {
    console.error('Error fetching songs:', error);
    showError('Failed to fetch songs');
    return null;
  }
}

/**
 * Search for songs
 * Endpoint: GET /api/search
 */
export async function searchSongs(query) {
  try {
    if (!query) return null;

    const params = new URLSearchParams({
      query: query,
      songCount: 50
    });

    const response = await navidromeRequest(`/api/search?${params}`);
    const data = await response.json();
    
    console.log('Search results:', data);
    return data;
  } catch (error) {
    console.error('Error searching:', error);
    showError('Search failed');
    return null;
  }
}

/**
 * Get song details
 * Endpoint: GET /api/songs/{id}
 */
export async function getSongDetails(songId) {
  try {
    const response = await navidromeRequest(`/api/songs/${songId}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching song details:', error);
    return null;
  }
}

// ============================================
// PLAYLIST EXAMPLES
// ============================================

/**
 * Get all playlists
 * Endpoint: GET /api/playlists
 */
export async function getPlaylists() {
  try {
    const response = await navidromeRequest('/api/playlists');
    const data = await response.json();
    
    console.log('User playlists:', data);
    return data;
  } catch (error) {
    console.error('Error fetching playlists:', error);
    showError('Failed to fetch playlists');
    return null;
  }
}

/**
 * Get playlist details with songs
 * Endpoint: GET /api/playlists/{id}
 */
export async function getPlaylistDetails(playlistId) {
  try {
    const response = await navidromeRequest(`/api/playlists/${playlistId}`);
    const data = await response.json();
    
    console.log('Playlist:', data);
    return data;
  } catch (error) {
    console.error('Error fetching playlist:', error);
    return null;
  }
}

/**
 * Create new playlist
 * Endpoint: POST /api/playlists
 */
export async function createPlaylist(name, comment = '') {
  try {
    const response = await navidromeRequest('/api/playlists', {
      method: 'POST',
      body: JSON.stringify({
        name: name,
        comment: comment
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    showSuccess(`Playlist "${name}" created`);
    return data;
  } catch (error) {
    console.error('Error creating playlist:', error);
    showError('Failed to create playlist');
    return null;
  }
}

/**
 * Add song to playlist
 * Endpoint: POST /api/playlists/{id}/songs
 */
export async function addSongToPlaylist(playlistId, songId) {
  try {
    const response = await navidromeRequest(`/api/playlists/${playlistId}/songs`, {
      method: 'POST',
      body: JSON.stringify({ ids: [songId] })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    showSuccess('Song added to playlist');
    return true;
  } catch (error) {
    console.error('Error adding song to playlist:', error);
    showError('Failed to add song to playlist');
    return false;
  }
}

/**
 * Remove song from playlist
 * Endpoint: DELETE /api/playlists/{id}/songs/{songId}
 */
export async function removeSongFromPlaylist(playlistId, songId) {
  try {
    const response = await navidromeRequest(
      `/api/playlists/${playlistId}/songs/${songId}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    showSuccess('Song removed from playlist');
    return true;
  } catch (error) {
    console.error('Error removing song:', error);
    showError('Failed to remove song');
    return false;
  }
}

/**
 * Delete playlist
 * Endpoint: DELETE /api/playlists/{id}
 */
export async function deletePlaylist(playlistId) {
  try {
    const response = await navidromeRequest(`/api/playlists/${playlistId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    showSuccess('Playlist deleted');
    return true;
  } catch (error) {
    console.error('Error deleting playlist:', error);
    showError('Failed to delete playlist');
    return false;
  }
}

// ============================================
// ARTIST & ALBUM EXAMPLES
// ============================================

/**
 * Get all artists
 * Endpoint: GET /api/artists
 */
export async function getArtists(options = {}) {
  try {
    const params = new URLSearchParams({
      limit: options.limit || 500,
      offset: options.offset || 0
    });

    const response = await navidromeRequest(`/api/artists?${params}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching artists:', error);
    showError('Failed to fetch artists');
    return null;
  }
}

/**
 * Get artist details
 * Endpoint: GET /api/artists/{id}
 */
export async function getArtistDetails(artistId) {
  try {
    const response = await navidromeRequest(`/api/artists/${artistId}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching artist:', error);
    return null;
  }
}

/**
 * Get all albums
 * Endpoint: GET /api/albums
 */
export async function getAlbums(options = {}) {
  try {
    const params = new URLSearchParams({
      limit: options.limit || 500,
      offset: options.offset || 0
    });

    const response = await navidromeRequest(`/api/albums?${params}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching albums:', error);
    showError('Failed to fetch albums');
    return null;
  }
}

/**
 * Get album details
 * Endpoint: GET /api/albums/{id}
 */
export async function getAlbumDetails(albumId) {
  try {
    const response = await navidromeRequest(`/api/albums/${albumId}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching album:', error);
    return null;
  }
}

// ============================================
// FAVORITES/STARS EXAMPLES
// ============================================

/**
 * Star a song (favorite)
 * Endpoint: POST /api/songs/{id}/star
 */
export async function starSong(songId) {
  try {
    const response = await navidromeRequest(`/api/songs/${songId}/star`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    showSuccess('Song starred');
    return true;
  } catch (error) {
    console.error('Error starring song:', error);
    showError('Failed to star song');
    return false;
  }
}

/**
 * Unstar a song
 * Endpoint: DELETE /api/songs/{id}/star
 */
export async function unstarSong(songId) {
  try {
    const response = await navidromeRequest(`/api/songs/${songId}/star`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    showSuccess('Song unstarred');
    return true;
  } catch (error) {
    console.error('Error unstarring song:', error);
    showError('Failed to unstar song');
    return false;
  }
}

/**
 * Get user's starred/favorite songs
 * Endpoint: GET /api/songs?starred=true
 */
export async function getFavoriteSongs() {
  try {
    const params = new URLSearchParams({
      starred: true,
      limit: 500
    });

    const response = await navidromeRequest(`/api/songs?${params}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching favorites:', error);
    showError('Failed to fetch favorites');
    return null;
  }
}

// ============================================
// PLAYBACK HISTORY EXAMPLES
// ============================================

/**
 * Scrobble (log) a song play
 * Endpoint: POST /api/songs/{id}/scrobble
 */
export async function scrobbleSong(songId) {
  try {
    const response = await navidromeRequest(`/api/songs/${songId}/scrobble`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Error scrobbling song:', error);
    return false;
  }
}

/**
 * Get recently played songs
 * Endpoint: GET /api/songs?mostRecent=true
 */
export async function getRecentlyPlayed(limit = 50) {
  try {
    const params = new URLSearchParams({
      mostRecent: true,
      limit: limit
    });

    const response = await navidromeRequest(`/api/songs?${params}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching recently played:', error);
    showError('Failed to fetch recently played');
    return null;
  }
}

// ============================================
// USAGE EXAMPLES
// ============================================

/**
 * Example: Load user's music library on startup
 */
export async function loadUserLibrary() {
  console.log('Loading user library...');

  // Check authentication
  if (!isAuthenticated()) {
    console.log('User not authenticated');
    return;
  }

  try {
    // Get user info
    const user = getCurrentUser();
    console.log('Logged in as:', user.username);

    // Load playlists
    const playlists = await getPlaylists();
    console.log('Playlists:', playlists);

    // Load favorite songs
    const favorites = await getFavoriteSongs();
    console.log('Favorite songs:', favorites);

    // Load artists
    const artists = await getArtists({ limit: 100 });
    console.log('Artists:', artists);

  } catch (error) {
    console.error('Error loading library:', error);
    showError('Failed to load library');
  }
}

/**
 * Example: Create playlist and add songs
 */
export async function createPlaylistWithSongs(name, songIds) {
  try {
    // Create playlist
    const playlist = await createPlaylist(name, 'Created from player');
    if (!playlist) return null;

    // Add songs to playlist
    for (const songId of songIds) {
      await addSongToPlaylist(playlist.id, songId);
    }

    showSuccess(`Playlist "${name}" created with ${songIds.length} songs`);
    return playlist;
  } catch (error) {
    console.error('Error creating playlist with songs:', error);
    showError('Failed to create playlist');
    return null;
  }
}

/**
 * Example: Search and play
 */
export async function searchAndQueueSongs(query) {
  try {
    const results = await searchSongs(query);
    if (!results || !results.songs) return;

    console.log(`Found ${results.songs.length} songs for "${query}"`);
    // TODO: Add songs to queue/playlist
    return results.songs;
  } catch (error) {
    console.error('Error searching:', error);
    showError('Search failed');
    return null;
  }
}

// ============================================
// EXPORT FOR MODULE USE
// ============================================

export default {
  checkNavidromeAccess,
  // Music
  getSongs,
  searchSongs,
  getSongDetails,
  // Playlists
  getPlaylists,
  getPlaylistDetails,
  createPlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  deletePlaylist,
  // Artists & Albums
  getArtists,
  getArtistDetails,
  getAlbums,
  getAlbumDetails,
  // Favorites
  starSong,
  unstarSong,
  getFavoriteSongs,
  // Playback
  scrobbleSong,
  getRecentlyPlayed,
  // Utility
  loadUserLibrary,
  createPlaylistWithSongs,
  searchAndQueueSongs
};
