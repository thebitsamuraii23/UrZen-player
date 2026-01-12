/**
 * Music Search Module - Navidrome Integration
 * Search for songs and add them to queue
 */

import { isAuthenticated, getCurrentUser } from './auth.js';

const NAVIDROME_API = 'https://music.youtubemusicdownloader.life';
let currentSearchResults = [];

/**
 * Open music search modal
 */
window.openMusicSearch = function() {
  if (!isAuthenticated()) {
    // Show auth required message
    const modal = document.getElementById('musicSearchModal');
    const notAuth = document.getElementById('musicSearchNotAuth');
    const content = document.getElementById('musicSearchContent');
    
    if (notAuth) notAuth.style.display = 'block';
    if (content) content.style.display = 'none';
    
    if (modal) modal.classList.add('active');
    return;
  }

  // Show search content
  const modal = document.getElementById('musicSearchModal');
  const notAuth = document.getElementById('musicSearchNotAuth');
  const content = document.getElementById('musicSearchContent');
  
  if (notAuth) notAuth.style.display = 'none';
  if (content) content.style.display = 'block';
  
  if (modal) modal.classList.add('active');
  
  // Focus search input
  setTimeout(() => {
    const input = document.getElementById('musicSearchInput');
    if (input) input.focus();
  }, 100);

  // Setup search input listener
  setupSearchListener();
};

/**
 * Close music search modal
 */
window.closeMusicSearch = function() {
  const modal = document.getElementById('musicSearchModal');
  if (modal) modal.classList.remove('active');
};

/**
 * Setup search input with debounce
 */
function setupSearchListener() {
  const input = document.getElementById('musicSearchInput');
  if (!input) return;

  let searchTimeout;
  input.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();

    if (query.length < 2) {
      document.getElementById('musicSearchResults').innerHTML = '';
      document.getElementById('musicSearchStatus').textContent = '';
      return;
    }

    document.getElementById('musicSearchStatus').textContent = 'Searching...';

    searchTimeout = setTimeout(() => {
      performSearch(query);
    }, 300);
  });

  // Allow Enter key to trigger search
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimeout);
      const query = input.value.trim();
      if (query.length >= 2) {
        performSearch(query);
      }
    }
  });
}

/**
 * Perform search on Navidrome
 */
async function performSearch(query) {
  try {
    console.log('[SEARCH] Searching for:', query);
    
    document.getElementById('musicSearchStatus').textContent = 'Searching...';
    
    const results = await navidromeSearch(query);
    currentSearchResults = results;
    
    renderSearchResults(results);
    
    const count = results.length;
    document.getElementById('musicSearchStatus').textContent = 
      count === 0 ? 'No results found' : `Found ${count} songs`;
  } catch (error) {
    console.error('[SEARCH] Error:', error);
    document.getElementById('musicSearchStatus').textContent = 
      'Error searching. Please try again.';
    document.getElementById('musicSearchResults').innerHTML = '';
  }
}

/**
 * Search on Navidrome API (via our backend proxy)
 */
async function navidromeSearch(query) {
  try {
    // Use our backend to proxy the request (avoids CORS issues)
    const response = await fetch(
      `http://localhost:3001/api/navidrome/search?q=${encodeURIComponent(query)}`
    );

    if (!response.ok) throw new Error(`API error: ${response.statusText}`);

    const data = await response.json();
    
    // Return songs array
    return (data.songs || data.results || []).slice(0, 50);
  } catch (error) {
    console.error('[NAVIDROME] Search error:', error);
    throw error;
  }
}

/**
 * Render search results
 */
function renderSearchResults(results) {
  const container = document.getElementById('musicSearchResults');
  
  if (results.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-dim); padding: 40px 20px;">No songs found</p>';
    return;
  }

  let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';

  results.forEach((song, index) => {
    const title = song.title || song.name || 'Unknown';
    const artist = song.artist || 'Unknown Artist';
    const album = song.album || '';
    const duration = formatTime(song.duration || 0);
    
    html += `
      <div class="search-result-item" onclick="window.playSearchResult(${index})">
        <div style="flex: 1;">
          <div style="font-weight: 600; color: white; font-size: 14px;">${escapeHtml(title)}</div>
          <div style="color: var(--text-dim); font-size: 12px; margin-top: 4px;">
            ${escapeHtml(artist)}${album ? ` - ${escapeHtml(album)}` : ''}
          </div>
        </div>
        <div style="color: var(--text-dim); font-size: 12px; min-width: 45px; text-align: right;">
          ${duration}
        </div>
        <i data-lucide="play-circle" style="width: 20px; height: 20px; color: var(--accent); margin-left: 12px; cursor: pointer;"></i>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;

  // Refresh icons
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

/**
 * Play search result and add to queue
 */
window.playSearchResult = async function(index) {
  const song = currentSearchResults[index];
  if (!song) return;

  try {
    console.log('[SEARCH] Playing:', song.title);

    // Create song object for queue
    const queueSong = {
      id: song.id || Math.random().toString(36).substr(2, 9),
      title: song.title || 'Unknown',
      artist: song.artist || 'Unknown Artist',
      album: song.album || '',
      duration: song.duration || 0,
      url: song.path || `${NAVIDROME_API}/stream/${song.id}`,
      source: 'navidrome',
      navidromeId: song.id,
      cover: song.coverArt ? `${NAVIDROME_API}/cover/${song.coverArt}` : null
    };

    // Add to queue (state.library is the queue)
    if (window.state && window.state.library) {
      window.state.library.push(queueSong);
      
      // Play immediately
      if (window.playFromQueue) {
        window.playFromQueue(window.state.library.length - 1);
      }
      
      // Update UI
      if (window.renderLibrary) {
        window.renderLibrary();
      }
      
      // Close search modal
      setTimeout(() => {
        window.closeMusicSearch();
      }, 500);
    }
  } catch (error) {
    console.error('[SEARCH] Error playing result:', error);
  }
};

/**
 * Helper: Format time in seconds to MM:SS
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Helper: Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Export functions
export { performSearch, renderSearchResults };
