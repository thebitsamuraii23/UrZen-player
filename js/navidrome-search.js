import { t } from './settings.js';

/**
 * Navidrome API Integration
 * Uses Subsonic API (search3.view and stream.view)
 * Works with guest account: guest / guest
 */

const NAVIDROME_URL_DEFAULT = 'https://music.youtubemusicdownloader.life';
const NAVIDROME_USER_DEFAULT = 'guest';
const NAVIDROME_PASS_DEFAULT = 'guest';
const API_VERSION = '1.16.1';
const APP_NAME = 'Z-Testing';

function getNavidromeBaseUrl() {
  try {
    const saved = localStorage.getItem('navidromeServer');
    if (saved && typeof saved === 'string' && saved.trim().length > 0) {
      return saved.replace(/\/+$/, '');
    }
  } catch (e) {
    console.warn('[NAVIDROME] Failed to read saved server:', e);
  }
  return NAVIDROME_URL_DEFAULT;
}

/**
 * Build Navidrome API URL with auth params
 */
function getNavidromeCredentials() {
  try {
    const savedUser = localStorage.getItem('navidromeUser');
    const savedPass = localStorage.getItem('navidromePass');
    const user = (savedUser && savedUser.trim().length > 0) ? savedUser.trim() : NAVIDROME_USER_DEFAULT;
    const pass = (savedPass && savedPass.trim().length > 0) ? savedPass.trim() : NAVIDROME_PASS_DEFAULT;
    return { user, pass };
  } catch (e) {
    return { user: NAVIDROME_USER_DEFAULT, pass: NAVIDROME_PASS_DEFAULT };
  }
}

function buildNavidromeUrl(method, params = {}) {
  const baseUrl = getNavidromeBaseUrl();
  const { user, pass } = getNavidromeCredentials();
  const baseParams = {
    u: user,
    p: pass,
    v: API_VERSION,
    c: APP_NAME,
    f: 'json'
  };

  const allParams = { ...baseParams, ...params };
  const queryString = new URLSearchParams(allParams).toString();
  
  return `${baseUrl}/rest/${method}?${queryString}`;
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
        title: song.title || t('unknown_title', 'Unknown'),
        artist: song.artist || t('unknown_artist', 'Unknown Artist'),
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
      title: song.title || t('unknown_title', 'Unknown'),
      artist: song.artist || t('unknown_artist', 'Unknown Artist'),
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
  console.log('[NAVIDROME_URL] Generating stream URL for ID:', songId, 'type:', typeof songId);
  const url = buildNavidromeUrl('stream.view', {
    id: songId
  });
  console.log('[NAVIDROME_URL] Generated URL:', url);
  return url;
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
      title: song.title || t('unknown_title', 'Unknown'),
      artist: song.artist || t('unknown_artist', 'Unknown Artist'),
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
    console.log('🎬 LOG_1: After streamUrl');
    
    // If we don't have metadata, fetch it
    let songDetails = null;
    if (!coverUrl || !title) {
      songDetails = await getSongDetails(songId);
    }
    console.log('🎬 LOG_2: After getSongDetails, songDetails =', songDetails);

    const finalTitle = title || songDetails?.title || t('unknown_title', 'Unknown');
    const finalArtist = artist || songDetails?.artist || t('unknown_artist', 'Unknown Artist');
    const finalAlbum = album || songDetails?.album || '';
    const finalCoverUrl = coverUrl || songDetails?.coverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100';
    console.log('🎬 LOG_3: Final metadata =', { finalTitle, finalArtist, finalAlbum });

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
        window.state.library.push(song);  // Добавляем в конец очереди, не в начало!
        
        // Сохраняем в IndexedDB для персистентности (используем глобальный db)
        try {
          if (window.db && window.db.songs) {
            // Используем существующую БД из app.js
            window.db.songs.add({
              title: finalTitle,
              artist: finalArtist,
              album: finalAlbum,
              duration: songDetails?.duration || 0,
              url: streamUrl,
              cover: finalCoverUrl,
              source: 'navidrome',
              navidromeId: songId,
              isFavorite: false,
              order: 999999 + Math.random() // Высокий порядок чтобы был в конце
            }).catch(err => console.warn('[NAVIDROME] DB save error:', err));
          }
        } catch (err) {
          console.warn('[NAVIDROME] Failed to save to DB:', err);
        }
      }
      
      // Update current index to this song
      const idx = window.state.library.findIndex(s => s.navidromeId === songId);
      if (idx !== -1) {
        window.state.currentIndex = idx;
      }
      if (typeof window.syncShufflePositionWithTrackId === 'function') {
        window.syncShufflePositionWithTrackId(songId);
      }
    }

    // Update player UI
    const dom = window.dom;
    if (dom && dom.audio) {
      console.log('[NAVIDROME] Setting audio source to:', streamUrl);
      console.log('🎬 LOG_4: dom and dom.audio exist');
      dom.audio.src = streamUrl;
      dom.audio.crossOrigin = 'anonymous';
      dom.audio.play().catch(err => console.error('[NAVIDROME] Play error:', err));
    } else {
      console.error('[NAVIDROME] DOM or audio element not found');
      console.log('🎬 LOG_4_ERROR: dom =', dom, 'dom.audio =', dom?.audio);
      return;
    }

    // Update track info display with final metadata
    if (dom) {
      console.log('🎬 LOG_5: Updating DOM text');
      dom.trackName.innerText = finalTitle;
      dom.artistName.innerText = finalArtist;
      
      if (finalCoverUrl) {
        dom.mainCover.src = finalCoverUrl;
        dom.vinylContainer.classList.add('visible');
      } else {
        dom.vinylContainer.classList.remove('visible');
      }
    }

    console.log('[NAVIDROME] Playing:', finalTitle, 'by', finalArtist);
    console.log('🎬 LOG_6: Before Media Session API');
    
    // Update browser title and Media Session API
    document.title = `${finalTitle} - ${finalArtist} | UrZen`;
    console.log('🎬 LOG_7: document.title set');
    
    if ('mediaSession' in navigator) {
      console.log('🎬 LOG_8: mediaSession exists in navigator');
      try {
        const metadata = {
          title: String(finalTitle || t('unknown_title', 'Unknown')),
          artist: String(finalArtist || t('unknown_artist', 'Unknown Artist')),
          album: String(finalAlbum || 'UrZen Player')
        };
        console.log('🎬 LOG_9: metadata object created =', metadata);
        
        if (finalCoverUrl) {
          metadata.artwork = [
            { src: finalCoverUrl, sizes: '96x96', type: 'image/jpeg' },
            { src: finalCoverUrl, sizes: '128x128', type: 'image/jpeg' },
            { src: finalCoverUrl, sizes: '192x192', type: 'image/jpeg' },
            { src: finalCoverUrl, sizes: '256x256', type: 'image/jpeg' }
          ];
          console.log('🎬 LOG_10: artwork added to metadata');
        }
        
        console.log('🎬 LOG_11: About to call navigator.mediaSession.metadata =');
        navigator.mediaSession.metadata = new MediaMetadata(metadata);
        console.log('🎬 LOG_12: navigator.mediaSession.metadata SET SUCCESS');
        
        navigator.mediaSession.playbackState = 'playing';
        console.log('🎬 LOG_13: playbackState set to playing');
        
        // Set position state for progress bar
        navigator.mediaSession.setPositionState({
          duration: song.duration || 0,
          playbackRate: 1.0,
          position: 0
        });
        console.log('🎬 LOG_14: setPositionState called');
        
        // Set up action handlers
        navigator.mediaSession.setActionHandler('play', () => {
          if (dom && dom.audio) dom.audio.play().catch(e => console.error('Play action error:', e));
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          if (dom && dom.audio) dom.audio.pause();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          if (window.nextTrack) window.nextTrack();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          if (window.prevTrack) window.prevTrack();
        });
        console.log('🎬 LOG_15: All action handlers set');
        
        console.log('[NAVIDROME] Media Session: Metadata updated', metadata);
      } catch (e) {
        console.error('[NAVIDROME] Media Session error:', e);
        console.error('🎬 ERROR in Media Session:', e.message);
      }
    } else {
      console.log('🎬 LOG_8_FAIL: mediaSession NOT in navigator');
    }
    console.log('🎬 LOG_16: End of Media Session code');
    
    // Сохраняем состояние очереди
    if (window.saveQueueState) {
      window.saveQueueState();
    }
    console.log('🎬 LOG_17: Queue saved');
    
    // Refresh UI immediately to show new song in queue
    if (window.renderLibrary) {
      window.renderLibrary();
    }
    if (window.renderSidebarQueue) {
      window.renderSidebarQueue();
    }
    
    // Close Navidrome UI and go back to library
    if (window.switchTab) {
      setTimeout(() => {
        window.switchTab('all');
      }, 500);
    }
  } catch (error) {
    console.error('[NAVIDROME] Play error:', error);
  }
};

/**
 * Get random songs from Navidrome
 */
const getAllNavidromeSongs = async function() {
  try {
    // Return cached songs if available
    if (window._navidromeSongsCache && window._navidromeSongsCache.length > 0) {
      console.log('[NAVIDROME] Returning cached songs:', window._navidromeSongsCache.length);
      return window._navidromeSongsCache;
    }
    
    console.log('[NAVIDROME] Fetching random songs from Navidrome...');
    
    const url = buildNavidromeUrl('getRandomSongs.view', {
      size: 200
    });

    console.log('[NAVIDROME] Request URL:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error('[NAVIDROME] HTTP Error:', response.status, response.statusText);
      // Try to load from cache if API fails
      const cached = localStorage.getItem('navidromeSongs');
      if (cached) {
        try {
          const cachedSongs = JSON.parse(cached);
          console.log('[NAVIDROME] Using cached songs:', cachedSongs.length);
          if (window.state) {
            window.state.navidromeSongs = cachedSongs;
          }
          return cachedSongs;
        } catch (e) {
          console.error('[NAVIDROME] Cache parse error:', e);
        }
      }
      return [];
    }

    const data = await response.json();
    const songs = (data['subsonic-response']?.randomSongs?.song || []).map(song => ({
      id: song.id,
      navidromeId: song.id,
      title: song.title || t('unknown_title', 'Unknown'),
      artist: song.artist || t('unknown_artist', 'Unknown Artist'),
      album: song.album || '',
      duration: song.duration || 0,
      cover: song.coverArt ? buildNavidromeUrl('getCoverArt.view', {
        id: song.coverArt,
        size: 200
      }) : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100',
      source: 'navidrome'
    }));

    console.log('[NAVIDROME] Successfully fetched:', songs.length, 'songs');
    
    // Save to localStorage for caching
    try {
      localStorage.setItem('navidromeSongs', JSON.stringify(songs));
      localStorage.setItem('navidromeSongsLastUpdate', new Date().toISOString());
      console.log('[NAVIDROME] Cached to localStorage');
    } catch (e) {
      console.warn('[NAVIDROME] localStorage save error:', e);
    }
    
    // Cache in memory
    window._navidromeSongsCache = songs;
    
    // Store in state.navidromeSongs (NOT in state.library)
    if (window.state) {
      window.state.navidromeSongs = songs;
      console.log('[NAVIDROME] Stored in state.navidromeSongs');
    }

    return songs;
  } catch (error) {
    console.error('[NAVIDROME] Fetch error:', error);
    // Try to load from cache on error
    const cached = localStorage.getItem('navidromeSongs');
    if (cached) {
      try {
        const cachedSongs = JSON.parse(cached);
        console.log('[NAVIDROME] Using cached songs due to error:', cachedSongs.length);
        if (window.state) {
          window.state.navidromeSongs = cachedSongs;
        }
        return cachedSongs;
      } catch (e) {
        console.error('[NAVIDROME] Cache parse error:', e);
      }
    }
    return [];
  }
};

// Expose functions to window for easy access
window.searchNavidrome = searchNavidrome;
window.getNavidromeStreamUrl = getNavidromeStreamUrl;
window.getSongDetails = getSongDetails;
window.performCombinedSearch = performCombinedSearch;
window.playNavidromeSong = playNavidromeSong;
window.getAllNavidromeSongs = getAllNavidromeSongs;
window.searchNavidrome = searchNavidrome;

export { searchLocalLibrary, searchNavidrome, getNavidromeStreamUrl, getSongDetails, performCombinedSearch, playNavidromeSong, getAllNavidromeSongs };
