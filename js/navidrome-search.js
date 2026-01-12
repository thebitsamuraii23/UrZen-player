/**
 * Navidrome API Integration
 * Uses Subsonic API (search3.view and stream.view)
 * Works with guest account: guest / guest
 */

const NAVIDROME_URL = 'https://music.youtubemusicdownloader.life';
const NAVIDROME_USER = 'guest';
const NAVIDROME_PASS = 'guest';
const API_VERSION = '1.16.1';
const APP_NAME = 'Z-BETA';

/**
 * Build Navidrome API URL with auth params
 */
function buildNavidromeUrl(method, params = {}) {
  const baseParams = {
    u: NAVIDROME_USER,
    p: NAVIDROME_PASS,
    v: API_VERSION,
    c: APP_NAME,
    f: 'json'
  };

  const allParams = { ...baseParams, ...params };
  const queryString = new URLSearchParams(allParams).toString();
  
  return `${NAVIDROME_URL}/rest/${method}?${queryString}`;
}

/**
 * Search for songs on Navidrome
 */
const searchNavidrome = async function(query) {
  if (!query || query.length < 2) {
    return [];
  }

  try {
    console.log('[NAVIDROME] Searching for:', query);
    
    const url = buildNavidromeUrl('search3.view', {
      query: query
    });

    const response = await fetch(url);
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);

    const data = await response.json();
    
    // Extract songs from response
    const searchResult = data['subsonic-response']?.searchResult3;
    const songs = (searchResult?.song || []).map(song => {
      // Build cover art URL from Navidrome
      let coverUrl = null;
      if (song.coverArt) {
        coverUrl = buildNavidromeUrl('getCoverArt.view', {
          id: song.coverArt,
          size: 200
        });
      }
      
      return {
        id: song.id,
        title: song.title || 'Unknown',
        artist: song.artist || 'Unknown Artist',
        album: song.album || '',
        duration: song.duration || 0,
        navidromeId: song.id,
        cover: coverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100',
        source: 'navidrome'
      };
    });

    console.log('[NAVIDROME] Found:', songs.length, 'songs');
    return songs;
  } catch (error) {
    console.error('[NAVIDROME] Search error:', error);
    return [];
  }
};

/**
 * Get detailed song info including cover art
 */
const getSongDetails = async function(songId) {
  try {
    const url = buildNavidromeUrl('getSong.view', {
      id: songId
    });

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const song = data['subsonic-response']?.song;
    
    if (!song) return null;

    return {
      id: song.id,
      title: song.title || 'Unknown',
      artist: song.artist || 'Unknown Artist',
      album: song.album || '',
      duration: song.duration || 0,
      coverUrl: song.coverArt ? buildNavidromeUrl('getCoverArt.view', {
        id: song.coverArt,
        size: 300
      }) : null
    };
  } catch (error) {
    console.error('[NAVIDROME] Failed to get song details:', error);
    return null;
  }
};

/**
 * Get streaming URL for a song
 */
const getNavidromeStreamUrl = function(songId) {
  return buildNavidromeUrl('stream.view', {
    id: songId
  });
};

/**
 * Search in local library + Navidrome
 */
const performCombinedSearch = async function(query) {
  if (!query || query.length < 2) {
    return [];
  }

  try {
    console.log('[SEARCH] Starting combined search for:', query);
    
    // Search in both local library and Navidrome
    const [localResults, navidromeResults] = await Promise.all([
      searchLocalLibrary(query),
      searchNavidrome(query)
    ]);

    console.log('[SEARCH] Local results:', localResults.length);
    console.log('[SEARCH] Navidrome results:', navidromeResults.length);

    // Combine results (local first, then Navidrome, but show both)
    const combined = [
      ...localResults.map(s => ({ ...s, source: 'local' })),
      ...navidromeResults
    ];

    // Remove duplicates ONLY if exact same title + artist + artist match
    // This allows same song from different sources
    const seen = new Map();
    const unique = [];
    
    combined.forEach(song => {
      const key = `${(song.title || '').toLowerCase()}|||${(song.artist || '').toLowerCase()}`;
      
      // Keep both versions but mark as duplicates if needed
      if (seen.has(key)) {
        // Already have this song - add it anyway but we can flag it
        unique.push(song);
      } else {
        seen.set(key, true);
        unique.push(song);
      }
    });

    console.log('[SEARCH] Total unique results:', unique.length);
    return unique;
  } catch (error) {
    console.error('[SEARCH] Combined search error:', error);
    return await searchLocalLibrary(query);
  }
};

/**
 * Search in local library (Dexie database)
 */
async function searchLocalLibrary(query) {
  try {
    if (!window.state?.library) {
      console.log('[SEARCH] Local library not available');
      return [];
    }

    const lowerQuery = query.toLowerCase();
    
    const results = window.state.library.filter(song => {
      const title = (song.title || '').toLowerCase();
      const artist = (song.artist || '').toLowerCase();
      const album = (song.album || '').toLowerCase();
      
      return title.includes(lowerQuery) || 
             artist.includes(lowerQuery) || 
             album.includes(lowerQuery);
    }).slice(0, 50).map(song => ({
      id: song.id,
      title: song.title || 'Unknown',
      artist: song.artist || 'Unknown Artist',
      album: song.album || '',
      duration: song.duration || 0,
      cover: song.cover || '',
      source: 'local',
      url: song.url
    }));
    
    console.log('[SEARCH] Local results found:', results.length);
    return results;
  } catch (error) {
    console.error('[SEARCH] Local search error:', error);
    return [];
  }
}

/**
 * Play a Navidrome song
 */
const playNavidromeSong = async function(songId, title, artist, album = '', coverUrl = '') {
  try {
    console.log('[NAVIDROME] playNavidromeSong called with:', { songId, title, artist, album, coverUrl });
    
    const streamUrl = getNavidromeStreamUrl(songId);
    console.log('[NAVIDROME] Stream URL:', streamUrl);
    
    // If we don't have metadata, fetch it
    let songDetails = null;
    if (!coverUrl || !title) {
      songDetails = await getSongDetails(songId);
    }

    const finalTitle = title || songDetails?.title || 'Unknown';
    const finalArtist = artist || songDetails?.artist || 'Unknown Artist';
    const finalAlbum = album || songDetails?.album || '';
    const finalCoverUrl = coverUrl || songDetails?.coverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100';

    // Create song object with complete metadata
    const song = {
      id: songId,
      title: finalTitle,
      artist: finalArtist,
      album: finalAlbum,
      duration: songDetails?.duration || 0,
      url: streamUrl,
      cover: finalCoverUrl,
      source: 'navidrome',
      navidromeId: songId
    };

    // Add to library/queue if not already there
    if (window.state?.library) {
      const exists = window.state.library.some(s => s.navidromeId === songId);
      if (!exists) {
        window.state.library.unshift(song);
      }
      
      // Save Navidrome songs to localStorage for persistence
      const navidromeSongs = window.state.library.filter(s => s.source === 'navidrome');
      localStorage.setItem('navidromeSongs', JSON.stringify(navidromeSongs));
      console.log('[NAVIDROME] Saved', navidromeSongs.length, 'Navidrome songs to localStorage');
    }

    // Update player UI (similar to playTrack)
    const dom = window.dom;
    if (dom && dom.audio) {
      console.log('[NAVIDROME] Setting audio source to:', streamUrl);
      dom.audio.src = streamUrl;
      dom.audio.crossOrigin = 'anonymous';
      dom.audio.play().catch(err => console.error('[NAVIDROME] Play error:', err));
    } else {
      console.error('[NAVIDROME] DOM or audio element not found');
      return;
    }

    // Update track info display with final metadata
    if (dom) {
      dom.trackName.innerText = finalTitle;
      dom.artistName.innerText = finalArtist;
      
      if (finalCoverUrl) {
        dom.mainCover.src = finalCoverUrl;
        dom.vinylContainer.classList.add('visible');
      } else {
        dom.vinylContainer.classList.remove('visible');
      }
    }

    // Update current index to this song (if it exists in library)
    if (window.state?.library) {
      const idx = window.state.library.findIndex(s => s.navidromeId === songId);
      if (idx !== -1) {
        window.state.currentIndex = idx;
      }
    }

    console.log('[NAVIDROME] Playing:', finalTitle, 'by', finalArtist);
    
    // Render library to show as active
    if (window.renderLibrary) {
      window.renderLibrary();
    }
  } catch (error) {
    console.error('[NAVIDROME] Play error:', error);
  }
};

// Expose functions to window for easy access
window.searchNavidrome = searchNavidrome;
window.getNavidromeStreamUrl = getNavidromeStreamUrl;
window.getSongDetails = getSongDetails;
window.performCombinedSearch = performCombinedSearch;
window.playNavidromeSong = playNavidromeSong;

export { searchLocalLibrary, searchNavidrome, getNavidromeStreamUrl, getSongDetails, performCombinedSearch, playNavidromeSong };
