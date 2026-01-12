/**
 * Authentication Module
 * Handles login, registration, and JWT token management
 */

// Dynamic API URL - use same domain in production, localhost in development
const AUTH_API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `http://localhost:3001`
  : window.location.origin;

// ============================================
// Authentication Functions
// ============================================

/**
 * Initialize authentication on page load (non-blocking)
 */
export function initAuth() {
  try {
    console.log('[AUTH] Starting initialization');
    
    if (!document.getElementById('authModal')) {
      console.warn('[AUTH] Auth modal not found');
      setTimeout(() => initAuth(), 500);
      return;
    }

    const token = getTokenFromLocalStorage();
    const username = getUsernameFromLocalStorage();

    if (token && username) {
      console.log('[AUTH] Found token, updating UI...');
      updateAuthNavItem(username);
    } else {
      console.log('[AUTH] No token found');
      updateAuthNavItem(null);
    }
  } catch (err) {
    console.error('[AUTH] Init error:', err);
  }
}

/**
 * Toggle auth modal
 */
window.toggleAuthModal = function() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.toggle('active');
  }
};

/**
 * Switch between login and register tabs
 */
window.switchAuthTab = function(tab) {
  const loginTab = document.getElementById('authLoginTab');
  const registerTab = document.getElementById('authRegisterTab');
  
  if (tab === 'login') {
    if (loginTab) loginTab.classList.add('active');
    if (registerTab) registerTab.classList.remove('active');
    
    loginTab.style.display = 'block';
    registerTab.style.display = 'none';
  } else {
    if (registerTab) registerTab.classList.add('active');
    if (loginTab) loginTab.classList.remove('active');
    
    registerTab.style.display = 'block';
    loginTab.style.display = 'none';
  }
};

/**
 * Handle login
 */
window.handleLogin = async function() {
  const username = document.getElementById('loginUsername')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value?.trim();
  const statusEl = document.getElementById('authLoginStatus');

  if (!username || !password) {
    showAuthStatus(statusEl, 'Please fill in all fields', 'error');
    return;
  }

  showAuthStatus(statusEl, 'Signing in...', 'loading');

  try {
    const response = await fetch(`${AUTH_API_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (response.ok && data.token) {
      saveTokenToLocalStorage(data.token);
      saveUsernameToLocalStorage(data.username);

      showAuthStatus(statusEl, 'Login successful!', 'success');
      
      document.getElementById('loginUsername').value = '';
      document.getElementById('loginPassword').value = '';

      setTimeout(() => {
        window.toggleAuthModal();
        updateAuthNavItem(data.username);
      }, 800);
    } else {
      showAuthStatus(statusEl, data.error || 'Login failed', 'error');
    }
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    showAuthStatus(statusEl, 'Connection error. Is the server running?', 'error');
  }
};

/**
 * Handle registration
 */
window.handleRegister = async function() {
  const username = document.getElementById('registerUsername')?.value?.trim();
  const password = document.getElementById('registerPassword')?.value?.trim();
  const statusEl = document.getElementById('authRegisterStatus');

  if (!username || !password) {
    showAuthStatus(statusEl, 'Please fill in all fields', 'error');
    return;
  }

  if (username.length < 3) {
    showAuthStatus(statusEl, 'Username must be at least 3 characters', 'error');
    return;
  }

  if (password.length < 6) {
    showAuthStatus(statusEl, 'Password must be at least 6 characters', 'error');
    return;
  }

  showAuthStatus(statusEl, 'Creating account...', 'loading');

  try {
    const response = await fetch(`${AUTH_API_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (response.ok) {
      showAuthStatus(statusEl, 'Account created! Signing in...', 'success');
      
      setTimeout(() => {
        saveTokenToLocalStorage(data.token);
        saveUsernameToLocalStorage(data.username);
        document.getElementById('registerUsername').value = '';
        document.getElementById('registerPassword').value = '';
        window.toggleAuthModal();
        updateAuthNavItem(data.username);
      }, 800);
    } else {
      showAuthStatus(statusEl, data.error || 'Registration failed', 'error');
    }
  } catch (error) {
    console.error('[AUTH] Register error:', error);
    showAuthStatus(statusEl, 'Connection error. Is the server running?', 'error');
  }
};

/**
 * Handle logout
 */
window.handleLogout = function() {
  clearAuthData();
  updateAuthNavItem(null);
  console.log('[AUTH] Logged out');
  
  // Optional: Show a toast message
  if (typeof showToast === 'function') {
    showToast('Logged out successfully');
  }
};

// ============================================
// UI Update Functions
// ============================================

/**
 * Update auth navigation item based on login state
 */
function updateAuthNavItem(username) {
  const loginItem = document.getElementById('authNavItem');
  const userItem = document.getElementById('userNavItem');
  const userLabel = document.getElementById('userNavLabel');
  
  if (!loginItem || !userItem || !userLabel) return;

  if (username) {
    // User is logged in - show user panel, hide login button
    loginItem.setAttribute('style', 'display: none !important;');
    userItem.setAttribute('style', 'display: flex !important;');
    userLabel.textContent = username;
    console.log('[AUTH] User logged in:', username, '- showing user nav item');
    
    // Refresh icons if lucide is available
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      setTimeout(() => window.lucide.createIcons(), 0);
    }
  } else {
    // User is not logged in - show login button, hide user panel
    loginItem.setAttribute('style', 'display: flex !important;');
    userItem.setAttribute('style', 'display: none !important;');
    console.log('[AUTH] User logged out - hiding user nav item');
    
    // Refresh icons if lucide is available
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      setTimeout(() => window.lucide.createIcons(), 0);
    }
  }
}

/**
 * Show status message in auth modal
 */
function showAuthStatus(element, message, type) {
  if (!element) return;
  
  element.textContent = message;
  element.className = 'auth-status show ' + type;
  
  if (type !== 'loading') {
    setTimeout(() => {
      element.classList.remove('show');
    }, 4000);
  }
}

// ============================================
// Local Storage Functions
// ============================================

function getTokenFromLocalStorage() {
  try {
    return localStorage.getItem('auth_token');
  } catch (e) {
    console.warn('[AUTH] localStorage read error:', e);
    return null;
  }
}

function saveTokenToLocalStorage(token) {
  try {
    localStorage.setItem('auth_token', token);
  } catch (e) {
    console.error('[AUTH] localStorage write error:', e);
  }
}

function getUsernameFromLocalStorage() {
  try {
    return localStorage.getItem('auth_username');
  } catch (e) {
    console.warn('[AUTH] localStorage read error:', e);
    return null;
  }
}

function saveUsernameToLocalStorage(username) {
  try {
    localStorage.setItem('auth_username', username);
  } catch (e) {
    console.error('[AUTH] localStorage write error:', e);
  }
}

function clearAuthData() {
  try {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_username');
  } catch (e) {
    console.error('[AUTH] localStorage clear error:', e);
  }
}

function getAuthHeaders() {
  const token = getTokenFromLocalStorage();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isAuthenticated() {
  return !!getTokenFromLocalStorage();
}

function getCurrentUser() {
  return getUsernameFromLocalStorage();
}

// ============================================
// Navidrome Integration
// ============================================

const NAVIDROME_API = 'https://music.youtubemusicdownloader.life';

async function navidromeRequest(endpoint, options = {}) {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(`${NAVIDROME_API}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`Navidrome API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[NAVIDROME]', error);
    throw error;
  }
}

// Navidrome API methods
async function getSongs() {
  return navidromeRequest('/api/songs');
}

async function searchSongs(query) {
  return navidromeRequest(`/api/search?q=${encodeURIComponent(query)}`);
}

async function getPlaylists() {
  return navidromeRequest('/api/playlists');
}

async function getArtists() {
  return navidromeRequest('/api/artists');
}

async function getAlbums() {
  return navidromeRequest('/api/albums');
}

async function starSong(songId) {
  return navidromeRequest(`/api/songs/${songId}/star`, { method: 'POST' });
}

async function unstarSong(songId) {
  return navidromeRequest(`/api/songs/${songId}/unstar`, { method: 'POST' });
}

async function scrobbleSong(songId) {
  return navidromeRequest(`/api/songs/${songId}/scrobble`, { method: 'POST' });
}

// Export for use in other modules
export { getAuthHeaders, isAuthenticated, getCurrentUser, clearAuthData };
