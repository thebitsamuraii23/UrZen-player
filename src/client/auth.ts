// @ts-nocheck
/**
 * Authentication Module
 * Handles login, registration, and JWT token management
 */

import { t } from './settings.ts';

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
      console.log('[AUTH] Found token, updating UI...'); // Log when token is found
      updateAuthNavItem(username);
    } else {
      console.log('[AUTH] No token found');
      updateAuthNavItem(null);
    }

    if (!window.__mobileAuthChipViewportBound) {
      window.__mobileAuthChipViewportBound = true;
      window.addEventListener('resize', () => {
        const currentUsername = getUsernameFromLocalStorage();
        updateMobileAuthChip(currentUsername);
      });
    }

    if (!window.__mobileAuthChipSettingsBound) {
      window.__mobileAuthChipSettingsBound = true;
      document.addEventListener('app:modal-toggled', (event) => {
        if (event?.detail?.id !== 'settingsModal') return;
        const currentUsername = getUsernameFromLocalStorage();
        updateMobileAuthChip(currentUsername);
      });
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
    showAuthStatus(statusEl, t('auth_fill_fields', 'Please fill in all fields'), 'error');
    return;
  }

  showAuthStatus(statusEl, t('auth_signing_in', 'Signing in...'), 'loading');

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

      showAuthStatus(statusEl, t('auth_login_success', 'Login successful!'), 'success');
      
      document.getElementById('loginUsername').value = '';
      document.getElementById('loginPassword').value = '';

      setTimeout(() => {
        window.toggleAuthModal();
        updateAuthNavItem(data.username);
        if (window.handlePostLoginSync) window.handlePostLoginSync();
      }, 800);
    } else {
      showAuthStatus(statusEl, data.error || t('auth_login_failed', 'Login failed'), 'error');
    }
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    showAuthStatus(statusEl, t('auth_connection_error', 'Connection error. Is the server running?'), 'error');
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
    showAuthStatus(statusEl, t('auth_fill_fields', 'Please fill in all fields'), 'error');
    return;
  }

  if (username.length < 3) {
    showAuthStatus(statusEl, t('auth_username_short', 'Username must be at least 3 characters'), 'error');
    return;
  }

  if (password.length < 6) {
    showAuthStatus(statusEl, t('auth_password_short', 'Password must be at least 6 characters'), 'error');
    return;
  }

  showAuthStatus(statusEl, t('auth_registering', 'Creating account...'), 'loading');

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
      showAuthStatus(statusEl, t('auth_register_success', 'Account created! Signing in...'), 'success');
      
      setTimeout(() => {
        saveTokenToLocalStorage(data.token);
        saveUsernameToLocalStorage(data.username);
        document.getElementById('registerUsername').value = '';
        document.getElementById('registerPassword').value = '';
        window.toggleAuthModal();
        updateAuthNavItem(data.username);
        if (window.handlePostLoginSync) window.handlePostLoginSync();
      }, 800);
    } else {
      showAuthStatus(statusEl, data.error || t('auth_register_failed', 'Registration failed'), 'error');
    }
  } catch (error) {
    console.error('[AUTH] Register error:', error);
    showAuthStatus(statusEl, t('auth_connection_error', 'Connection error. Is the server running?'), 'error');
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
    showToast(t('auth_logged_out', 'Logged out successfully'));
  }
};

window.handleMobileAuthAction = function() {
  const token = getTokenFromLocalStorage();
  const username = getUsernameFromLocalStorage();
  if (token && username) {
    window.handleLogout();
    return;
  }

  if (typeof window.openAuthModal === 'function') {
    window.openAuthModal('login');
    return;
  }

  if (typeof window.toggleAuthModal === 'function') {
    window.toggleAuthModal();
  }
};

// ============================================
// UI Update Functions
// ============================================

function updateMobileAuthChip(username) {
  const chip = document.getElementById('mobileAuthChip');
  const label = document.getElementById('mobileAuthChipLabel');
  if (!chip || !label) return;

  const isMobileViewport = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 1024px)').matches;
  const settingsOpen = document.body?.classList?.contains('settings-modal-open')
    || document.getElementById('settingsModal')?.classList.contains('active');
  chip.style.display = (isMobileViewport && !settingsOpen) ? '' : 'none';

  const normalizedUsername = String(username || '').trim();
  if (normalizedUsername) {
    label.textContent = normalizedUsername;
    label.removeAttribute('data-t');
    chip.dataset.mode = 'logout';
    chip.title = t('logout', 'Logout');
    chip.setAttribute('aria-label', `${t('logout', 'Logout')}: ${normalizedUsername}`);
    return;
  }

  label.textContent = t('login', 'Login');
  label.setAttribute('data-t', 'login');
  chip.dataset.mode = 'login';
  chip.title = t('auth_login_title', 'Sign In');
  chip.setAttribute('aria-label', t('auth_login_title', 'Sign In'));
}

/**
 * Update auth navigation item based on login state
 */
function updateAuthNavItem(username) {
  const loginItem = document.getElementById('authNavItem');
  const userItem = document.getElementById('userNavItem');
  const userLabel = document.getElementById('userNavLabel');

  if (username) {
    // User is logged in - show user panel, hide login button
    if (loginItem) loginItem.setAttribute('style', 'display: none !important;');
    if (userItem) userItem.setAttribute('style', 'display: flex !important;');
    if (userLabel) userLabel.textContent = username;
    console.log('[AUTH] User logged in:', username, '- showing user nav item');
    
    // Refresh icons if lucide is available
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      setTimeout(() => window.lucide.createIcons(), 0);
    }
  } else {
    // User is not logged in - show login button, hide user panel
    if (loginItem) loginItem.setAttribute('style', 'display: flex !important;');
    if (userItem) userItem.setAttribute('style', 'display: none !important;');
    console.log('[AUTH] User logged out - hiding user nav item');
    
    // Refresh icons if lucide is available
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      setTimeout(() => window.lucide.createIcons(), 0);
    }
  }

  updateMobileAuthChip(username);

  if (typeof window.updateHomeWelcome === 'function') {
    try {
      window.updateHomeWelcome(username || null);
    } catch (e) {
      console.warn('[AUTH] Failed to update home welcome:', e);
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

/**
 * Open auth modal with optional tab selection
 */
window.openAuthModal = function(tab = 'login') {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.add('active');
    if (tab === 'register') {
      window.switchAuthTab('register');
    } else {
      window.switchAuthTab('login');
    }
  }
};

/**
 * Show music section restriction overlay
 */
window.showMusicRestrictionOverlay = function(options = {}) {
  const overlay = document.getElementById('musicRestrictionOverlay');
  if (!overlay) return;

  const titleEl = document.getElementById('restrictionTitle');
  const messageEl = document.getElementById('restrictionMessage');
  const registerBtn = document.getElementById('musicRegisterBtn');

  const title = options?.title || t('music_restricted_title', 'Access Restricted');
  const message = options?.message || t('music_restricted_message', 'Register to use Music section');
  const authTab = options?.authTab === 'login' ? 'login' : 'register';

  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
  if (registerBtn) {
    registerBtn.onclick = () => {
      if (typeof window.closeMusicRestrictionOverlay === 'function') {
        window.closeMusicRestrictionOverlay();
      }
      if (typeof window.openAuthModal === 'function') {
        window.openAuthModal(authTab);
      }
    };
  }

  overlay.classList.add('active');
};

/**
 * Close music section restriction overlay
 */
window.closeMusicRestrictionOverlay = function() {
  const overlay = document.getElementById('musicRestrictionOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
};

// Export for use in other modules
export { getAuthHeaders, isAuthenticated, getCurrentUser, clearAuthData };
