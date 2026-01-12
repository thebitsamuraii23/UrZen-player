# 📖 Z BETA Authentication System - File Reference Guide

## Quick Navigation

### 🚀 Start Here
- **[QUICKSTART.md](QUICKSTART.md)** - 5 minutes to get running
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - What you got

### 📚 Detailed Documentation
- **[AUTH_SETUP.md](AUTH_SETUP.md)** - Complete setup & configuration guide
- **[CONFIG_TEMPLATES.js](CONFIG_TEMPLATES.js)** - Deployment configurations

### 🔧 Development Files
- **[server.js](server.js)** - Express backend API
- **[js/auth.js](js/auth.js)** - Frontend authentication logic
- **[css/auth.css](css/auth.css)** - Login panel styling
- **[js/navidrome-integration.js](js/navidrome-integration.js)** - Navidrome API client

### 🧪 Testing & Debugging
- **[AUTH_TESTING.js](AUTH_TESTING.js)** - Browser console testing
- **[.env.example](.env.example)** - Environment variables

---

## 📊 File Overview

### Backend

#### `server.js` (180 lines)
**Express.js API server**

Key features:
- User registration endpoint
- Login with JWT generation
- Token verification
- SQLite database integration
- CORS configuration
- Error handling

**Run with:**
```bash
npm start
```

---

### Frontend

#### `js/auth.js` (350 lines)
**Authentication logic for browser**

Key functions:
```javascript
window.handleLogin()        // Login user
window.handleRegister()     // Register new user
window.handleLogout()       // Logout user
initAuth()                  // Initialize on page load
```

Exported functions:
```javascript
isAuthenticated()           // Check if logged in
getCurrentUser()            // Get { username, token }
getAuthHeaders()            // Headers for API calls
navidromeRequest()          // Make authenticated requests
```

**Initialize automatically from app.js**

---

#### `css/auth.css` (250 lines)
**Glassmorphism login panel design**

Key classes:
- `.auth-panel` - Main login container
- `.auth-panel-content` - Card with glass effect
- `.auth-input` - Username/password inputs
- `.auth-btn-primary` - Login button
- `.auth-btn-secondary` - Register button
- `.user-info` - User logged-in state
- `.logout-btn` - Logout button

**Features:**
- Glassmorphism design (blur + transparency)
- Responsive (desktop, tablet, mobile)
- Smooth animations
- Hover effects
- Status messages (success/error)

---

#### `js/navidrome-integration.js` (500 lines)
**Complete Navidrome API client**

Main functions:
```javascript
// Music Library
getSongs()                  // Get all songs
searchSongs(query)          // Search music
getSongDetails(id)          // Get song info

// Playlists
getPlaylists()              // Get user playlists
getPlaylistDetails(id)      // Get playlist with songs
createPlaylist(name)        // Create new playlist
addSongToPlaylist(id, song) // Add song to playlist
deletePlaylist(id)          // Delete playlist

// Artists & Albums
getArtists()                // Get all artists
getAlbumDetails(id)         // Get album info

// Favorites
starSong(id)                // Mark as favorite
getFavoriteSongs()          // Get starred songs

// History
scrobbleSong(id)            // Log song play
getRecentlyPlayed()         // Get play history
```

**Example usage:**
```javascript
import { navidromeRequest, isAuthenticated } from './auth.js';

if (isAuthenticated()) {
  const response = await navidromeRequest('/api/songs');
  const songs = await response.json();
}
```

---

### Configuration & Dependencies

#### `package.json` (25 lines)
**Node.js project configuration**

Dependencies:
- `express` - Web framework
- `better-sqlite3` - Database
- `bcrypt` - Password hashing
- `jsonwebtoken` - JWT tokens
- `cors` - Cross-origin requests
- `nodemon` - Auto-reload (dev)

**Install:**
```bash
npm install
```

---

#### `.env.example` (30 lines)
**Environment variables template**

Variables:
- `PORT` - Server port (default: 3001)
- `JWT_SECRET` - Token signing key
- `NODE_ENV` - Environment (dev/prod)

**Create `.env` file:**
```bash
cp .env.example .env
# Edit .env with your values
```

---

#### `CONFIG_TEMPLATES.js` (350 lines)
**Deployment configurations**

Includes templates for:
- Development (localhost)
- Docker (containerized)
- Heroku (cloud)
- Railway (cloud)
- Self-hosted (VPS)
- AWS (cloud infrastructure)

**Choose your deployment and copy the config**

---

### Documentation

#### `QUICKSTART.md` (100 lines)
**5-minute quick start guide**

Covers:
1. Install dependencies
2. Start server
3. Open in browser
4. Test registration/login
5. Troubleshooting

**For fast setup, read this first!**

---

#### `AUTH_SETUP.md` (400 lines)
**Complete setup and reference guide**

Sections:
- Project structure
- Backend setup
- Frontend features
- API endpoints
- Navidrome integration
- Configuration
- Production checklist
- Troubleshooting

**For detailed information, read this**

---

#### `IMPLEMENTATION_SUMMARY.md` (500 lines)
**Complete project overview**

Includes:
- What was implemented
- File structure
- Quick start
- Security details
- API reference
- Testing guide
- Deployment options
- Feature summary

**For project overview, read this**

---

#### `AUTH_TESTING.js` (350 lines)
**Browser console testing utilities**

Test functions:
```javascript
// Server tests
testServerHealth()          // Check server
testRegister(user, pass)    // Test registration
testLogin(user, pass)       // Test login
testVerifyToken(token)      // Verify JWT

// UI tests
testLoginPanelUI()          // Check elements
testSetInputsAndLogin()     // Fill & test
testCSSLoaded()             // Check styling

// Demos
demoCompleteFlow()          // Full test
demoFrontendUI()            // UI walkthrough
demoManualGuide()           // Help menu
```

**Include in HTML:**
```html
<script src="AUTH_TESTING.js"></script>
```

**Run in browser console:**
```javascript
demoCompleteFlow()  // Full test
demoManualGuide()   // See all options
```

---

### Modified Files

#### `index.html` (342 lines)
**Updated HTML structure**

Changes:
- Added login panel HTML
- User info panel for logged-in state
- Positioned above Settings button
- Responsive on mobile

**Login panel HTML:**
```html
<div id="authPanel" class="auth-panel">
  <!-- Login inputs and buttons -->
</div>

<div id="userInfo" class="user-info">
  <!-- User info and logout -->
</div>
```

---

#### `css/main.css` (920 lines)
**Updated main stylesheet**

Changes:
- Imported `auth.css`
- Added `--accent-rgb` CSS variable
- Everything else unchanged

**New import:**
```css
@import url('auth.css');
```

---

#### `js/app.js` (1076 lines)
**Updated app initialization**

Changes:
- Imported `auth.js`
- Added auth initialization to startup steps

**In initApp() function:**
```javascript
import { initAuth } from './auth.js';

const steps = [
  { name: 'initAuth', fn: () => initAuth() },  // First!
  { name: 'initDOM', fn: () => initDOM() },
  // ... other steps
];
```

---

## 📂 Directory Structure

```
html-player/
├── 📄 Files Modified:
│   ├── index.html              (+login panel)
│   ├── css/main.css            (+auth.css import)
│   └── js/app.js               (+auth init)
│
├── 📄 Files Created (Backend):
│   ├── server.js               (Express API)
│   ├── package.json            (Dependencies)
│   └── users.db                (SQLite - auto-created)
│
├── 📄 Files Created (Frontend):
│   ├── css/auth.css            (Glassmorphism styles)
│   ├── js/auth.js              (Auth logic)
│   └── js/navidrome-integration.js (API client)
│
├── 📄 Files Created (Config):
│   ├── package.json            (Node dependencies)
│   ├── .env.example            (Environment template)
│   └── CONFIG_TEMPLATES.js     (Deployment configs)
│
└── 📄 Files Created (Documentation):
    ├── QUICKSTART.md           (5-min guide)
    ├── AUTH_SETUP.md           (Complete guide)
    ├── IMPLEMENTATION_SUMMARY.md (Project overview)
    ├── FILE_REFERENCE.md       (This file)
    └── AUTH_TESTING.js         (Testing utilities)
```

---

## 🎯 Reading Guide by Use Case

### "I want to get it running now"
→ Read: **[QUICKSTART.md](QUICKSTART.md)**

### "I need complete documentation"
→ Read: **[AUTH_SETUP.md](AUTH_SETUP.md)**

### "I need to deploy to production"
→ Read: **[CONFIG_TEMPLATES.js](CONFIG_TEMPLATES.js)**

### "I want to test/debug"
→ Run: **[AUTH_TESTING.js](AUTH_TESTING.js)** in console

### "I need to customize the UI"
→ Edit: **[css/auth.css](css/auth.css)**

### "I need to add API calls"
→ Use: **[js/navidrome-integration.js](js/navidrome-integration.js)**

### "I need to understand everything"
→ Read: **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)**

---

## 📊 Code Statistics

| File | Lines | Type | Purpose |
|------|-------|------|---------|
| server.js | 180 | Backend | Express API |
| js/auth.js | 350 | Frontend | Auth Logic |
| css/auth.css | 250 | Frontend | Styling |
| js/navidrome-integration.js | 500 | Frontend | API Client |
| package.json | 25 | Config | Dependencies |
| AUTH_SETUP.md | 400 | Docs | Complete Guide |
| QUICKSTART.md | 100 | Docs | Quick Start |
| IMPLEMENTATION_SUMMARY.md | 500 | Docs | Overview |
| CONFIG_TEMPLATES.js | 350 | Config | Deployments |
| AUTH_TESTING.js | 350 | Testing | Test Utils |

**Total: ~2,900 lines of code and documentation**

---

## 🔑 Key Concepts

### Authentication Flow
```
User visits → Check token → Login/Register → Store token → Use API
```

### Data Flow
```
Frontend Input → API Request → Backend → Database → Response → Frontend
```

### Security Layer
```
Plain Password → Bcrypt Hash → SQLite → Retrieved → Compared with bcrypt
                                           ↓
JWT Token → Signed → localStorage → API Request → Verified by backend
```

---

## ✅ Verification Checklist

After setup, verify everything works:

- [ ] `npm install` completes without errors
- [ ] `npm start` runs the server
- [ ] `http://localhost:3001/health` returns success
- [ ] Login panel appears in browser
- [ ] Can register new user
- [ ] Can login with credentials
- [ ] Token appears in localStorage
- [ ] Can logout successfully
- [ ] `demoCompleteFlow()` passes in console

---

## 🆘 Quick Help

### Server won't start?
→ Check: `npm start` output for errors
→ Verify: Node.js is installed (`node --version`)
→ Check: Port 3001 is free (`lsof -i :3001`)

### Login panel not showing?
→ Check: Browser console (F12) for errors
→ Verify: auth.css is in css/
→ Check: main.css imports auth.css

### Credentials don't work?
→ Check: Database exists (users.db)
→ Verify: User was registered
→ Try: Clear localStorage and re-register

### Navidrome API not working?
→ Check: Server is running
→ Verify: Navidrome URL is correct
→ Test: navidromeRequest() in console

---

## 📞 Need Help?

1. **Quick issues** → See QUICKSTART.md
2. **Technical details** → See AUTH_SETUP.md
3. **How to test** → Run AUTH_TESTING.js
4. **Deployment** → See CONFIG_TEMPLATES.js
5. **Understand all** → Read IMPLEMENTATION_SUMMARY.md

---

**Version:** 1.0.0  
**Status:** ✅ Production Ready  
**Last Updated:** January 2026

🎉 Everything is ready! Start with QUICKSTART.md
