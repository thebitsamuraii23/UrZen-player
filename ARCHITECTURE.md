# 🏗️ Z BETA Authentication - Architecture & Flow Diagrams

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER                            │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              HTML Player Application                      │   │
│  │                                                            │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │           Login Panel (CSS: auth.css)              │ │   │
│  │  │  ┌──────────────────────────────────────────────┐  │ │   │
│  │  │  │  Username Input    [____________]           │  │ │   │
│  │  │  │  Password Input    [____________]           │  │ │   │
│  │  │  │  [Login]  [Register]  [Status Message]      │  │ │   │
│  │  │  └──────────────────────────────────────────────┘  │ │   │
│  │  │                                                      │ │   │
│  │  │  After Login:                                        │ │   │
│  │  │  ┌──────────────────────────────────────────────┐  │ │   │
│  │  │  │  ✓ Logged in as: username  [Logout]         │  │ │   │
│  │  │  └──────────────────────────────────────────────┘  │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │                                                            │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │           Music Player Interface                    │ │   │
│  │  │  • Browse songs from Navidrome                      │ │   │
│  │  │  • Play/pause/controls                             │ │   │
│  │  │  • Manage playlists (via Navidrome API)           │ │   │
│  │  │  • Star/favorite songs                             │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │                                                            │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │           localStorage                             │ │   │
│  │  │  • auth_token: "eyJhbGc..."                        │ │   │
│  │  │  • auth_username: "username"                       │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ▲                                        │
│                          │                                        │
│         Frontend JS: auth.js                                      │
│         Handles: Login, Register, Token, Logout                  │
│                          │                                        │
└──────────────────────────┼────────────────────────────────────────┘
                           │
                           │ HTTP/JSON
                           │
        ┌──────────────────▼────────────────────┐
        │                                        │
        │     BACKEND (Node.js + Express)       │
        │     http://localhost:3001             │
        │                                        │
        │  ┌──────────────────────────────────┐ │
        │  │  Routes/Endpoints:               │ │
        │  │  • POST /register                │ │
        │  │  • POST /login                   │ │
        │  │  • POST /verify-token           │ │
        │  │  • GET  /health                 │ │
        │  └──────────────────────────────────┘ │
        │                    ▼                  │
        │  ┌──────────────────────────────────┐ │
        │  │  Authentication Logic:           │ │
        │  │  • Validate input                │ │
        │  │  • Hash password (bcrypt)        │ │
        │  │  • Generate JWT token           │ │
        │  │  • Verify token                 │ │
        │  └──────────────────────────────────┘ │
        │                    ▼                  │
        │  ┌──────────────────────────────────┐ │
        │  │  SQLite Database (users.db)      │ │
        │  │  • id INTEGER PRIMARY KEY       │ │
        │  │  • username TEXT UNIQUE         │ │
        │  │  • password TEXT (hashed)       │ │
        │  │  • created_at DATETIME          │ │
        │  └──────────────────────────────────┘ │
        │                                        │
        └────────────────────────────────────────┘
                           ▲
                           │
                  Uses JWT token for auth
                           │
        ┌──────────────────▼────────────────────┐
        │                                        │
        │    NAVIDROME MUSIC SERVER              │
        │    https://music.youtubemusicdownloader.life       │
        │                                        │
        │  • Songs                               │
        │  • Playlists                           │
        │  • Artists/Albums                      │
        │  • Favorites                           │
        │  • Playback history                    │
        │  • Scrobbling                          │
        │                                        │
        └────────────────────────────────────────┘
```

---

## Authentication Flow Diagram

```
User Visits App
     │
     ▼
┌─────────────────────────┐
│ Check localStorage      │
│ for JWT token          │
└────────┬────────────────┘
         │
    ┌────┴────┐
    │          │
    ▼          ▼
 Token?    No Token?
   │          │
   ▼          ▼
Verify    Show Login
Token     Panel
   │          │
   ├─────┬────┤
   │     │    │
Valid Invalid │
   │     │    │
   ▼     ▼    ▼
 Show   Login/
Users  Register
Info   Form
   │     │
   ▼     ▼
   User  User
   can   enters
   use   credentials
   app   │
        ▼
      Submit
      Form
        │
    ┌───┴───┐
    │       │
  Login  Register
    │       │
    ▼       ▼
  API Call to /login or /register
    │
    ▼
  Backend Validates
    │
    ├─── Error ──────┐
    │                ▼
    │           Show Error
    │           Message
    │                │
    │◄───────────────┘
    │
    ├─── Success ────┐
    │                ▼
    │           Return JWT
    │           Token
    │                │
    ▼◄───────────────┘
Save Token to
localStorage
    │
    ▼
Show User Info
Panel
    │
    ▼
User Can Access
App & Navidrome
    │
    ▼
[User browses music, plays songs, manages playlists]
    │
    ▼
User Logs Out
    │
    ▼
Clear localStorage
    │
    ▼
Show Login Panel
```

---

## Request Flow - Login Example

```
User Input:
  Username: "john_doe"
  Password: "password123"
     │
     ▼
Browser (Frontend)
  js/auth.js
  window.handleLogin()
     │
     ├─ Validate input
     ├─ Show "Logging in..." status
     │
     ▼
HTTP POST /login
Content-Type: application/json
{
  "username": "john_doe",
  "password": "password123"
}
     │
     ▼
Backend (server.js)
  app.post('/login', ...)
     │
     ├─ Receive request
     ├─ Validate input
     │
     ▼
Query Database
SELECT password FROM users WHERE username = "john_doe"
     │
     ├─ User not found? Return 401
     ├─ User found ──┐
     │              ▼
     │       Compare passwords:
     │       bcrypt.compare(input, stored)
     │              │
     │         ┌────┴────┐
     │         │         │
     │      Match?    No match?
     │         │         │
     │         ▼         ▼
     │      OK      Return 401
     │         │
     │         ▼
     │    Generate JWT:
     │    jwt.sign(
     │      { userId, username },
     │      SECRET,
     │      { expiresIn: '7d' }
     │    )
     │         │
     │         ▼
     └──── Send Response 200 OK
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "username": "john_doe"
}
     │
     ▼
Browser (Frontend)
  Parse response
  Save token to localStorage
     │
     ├─ localStorage.setItem('auth_token', token)
     ├─ localStorage.setItem('auth_username', 'john_doe')
     │
     ▼
Show "Login successful!" message
     │
     ▼
Hide login panel
Show user info panel
     │
     ▼
User is now authenticated!
Can make API calls to Navidrome with:
Header: Authorization: "Bearer " + token
```

---

## Data Flow - Navidrome API Call

```
User Action:
  "Browse my songs"
     │
     ▼
Frontend (auth.js)
  import { navidromeRequest } from './auth.js'
     │
     ├─ Check isAuthenticated()
     │
     ├─ Token valid? ──┐
     │                 ▼
     │            YES ──┐
     │                  ▼
     │            Get token from
     │            localStorage
     │                  │
     │                  ▼
     │            Build request:
     │            GET /api/songs
     │            Header: Authorization: "Bearer " + token
     │                  │
     │                  ▼
     │            Fetch to Navidrome
     │
     ├─ Token invalid? ──┐
     │                   ▼
     │            NO ──┐
     │                 ▼
     │            Show login panel
     │            Throw error
     │
     ▼
Navidrome API (HTTPS)
  GET /api/songs
  Authorization: "Bearer eyJhbGc..."
     │
     ├─ Verify token (with its own JWT secret)
     │
     ├─ Token valid? ──┐
     │                 ▼
     │            YES ──┐
     │                  ▼
     │            Query database
     │            Get all songs
     │            for this user
     │
     ├─ Token invalid? ──┐
     │                   ▼
     │            NO ──┐
     │                 ▼
     │            Return 401 Unauthorized
     │
     ▼
Navidrome Response:
{
  "songs": [
    { "id": 1, "title": "Song 1", "artist": "Artist 1" },
    { "id": 2, "title": "Song 2", "artist": "Artist 2" },
    ...
  ]
}
     │
     ▼
Frontend
  js/navidrome-integration.js
     │
     ├─ Parse response
     ├─ Update UI with songs
     ├─ Handle pagination
     │
     ▼
User sees songs in browser!
```

---

## Database Schema Diagram

```
┌────────────────────────────────────────┐
│           users.db (SQLite)            │
├────────────────────────────────────────┤
│                                        │
│  Table: users                          │
│  ┌──────────────────────────────────┐  │
│  │ id (INTEGER)                     │  │
│  │   PRIMARY KEY                    │  │
│  │   AUTO_INCREMENT                 │  │
│  │   Example: 1, 2, 3, ...          │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ username (TEXT)                  │  │
│  │   UNIQUE (no duplicates)         │  │
│  │   Example: "john_doe"            │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ password (TEXT)                  │  │
│  │   Hashed with bcrypt             │  │
│  │   Example:                       │  │
│  │   "$2b$10$N9qo8uLOikx..."        │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ created_at (DATETIME)            │  │
│  │   Auto-populated on insert       │  │
│  │   Example:                       │  │
│  │   2026-01-11 14:30:00            │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Sample Data:                          │
│  ┌──────────────────────────────────┐  │
│  │ id │ username │ password │ ctime │  │
│  ├────┼──────────┼──────────┼───────┤  │
│  │ 1  │ john_doe │ $2b$10$N│ ...   │  │
│  │ 2  │ jane_doc │ $2b$10$X│ ...   │  │
│  │ 3  │ bob_smith│ $2b$10$Z│ ...   │  │
│  └──────────────────────────────────┘  │
│                                        │
└────────────────────────────────────────┘
```

---

## Token Structure Diagram

```
JWT Token (3 parts separated by dots)
═══════════════════════════════════════════════════════

Part 1: Header
────────────────
{
  "alg": "HS256",
  "typ": "JWT"
}
│
├─ Base64 Encoded
│
▼
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9

───────────────────────────────────────────────────────

Part 2: Payload (Claims)
────────────────────────
{
  "userId": 1,
  "username": "john_doe",
  "iat": 1705000000,
  "exp": 1705604800
}
│
├─ Base64 Encoded
│
▼
eyJ1c2VyIjoiam9obiBkb2UiLCJpYXQiOjE3MDUwMDAwMDB9

───────────────────────────────────────────────────────

Part 3: Signature
─────────────────
HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  "your-secret-key"
)
│
▼
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c

───────────────────────────────────────────────────────

Complete Token:
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJ1c2VyIjoiam9obiBkb2UiLCJpYXQiOjE3MDUwMDAwMDB9.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c

Usage:
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

Validation:
1. Split by "."
2. Verify signature with secret
3. Check expiration time
4. Extract user info from payload
```

---

## CSS Animation Timeline

```
Login Panel Appearance:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Time:  0ms                 300ms                 600ms
       ▼                    ▼                      ▼
       ├────────────────────┼──────────────────────┤
       │                    │                      │
   opacity: 0            opacity: 0.5           opacity: 1
   transform:        transform: translateY  transform:
   translateY(30px)   (-15px)                translateY(0)
       │                    │                      │
       ├────────────────────┼──────────────────────┤
   [Invisible,         [Semi-visible,         [Fully visible
    off-screen]         midway]                at final position]
       
Duration: 600ms cubic-bezier(0.34, 1.56, 0.64, 1)
Result: Spring-like bounce animation


Button Hover Effect:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

State:     Default              Hover                Active
           ────────             ─────                ──────
background: gradient       lighter gradient      gradient-bright
opacity: 1.0               1.0                    1.0
transform: translateY(0)   translateY(-2px)      translateY(0)
box-shadow: normal         enhanced glow         subtle shadow

Transition: all 0.3s ease


Status Message Animation:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─ Success Message
│  0ms:    opacity: 0
│  ┌────► opacity: 1 (300ms)
│  │      ┌────► opacity: 0 (show for 3s, then fade)
│  ▼      ▼
│  ╔════════════════════════════════════════════╗
│  ║  ✓ Login successful!                       ║
│  ║     (Background: green with transparency)  ║
│  ╚════════════════════════════════════════════╝
│  (Auto-clears after 3 seconds)
│
├─ Error Message
│  ┌────► Stays visible until user takes action
│  │      or manually cleared
│  ▼
│  ╔════════════════════════════════════════════╗
│  ║  ✗ Invalid username or password            ║
│  ║     (Background: red with transparency)    ║
│  ╚════════════════════════════════════════════╝
│
└─ Loading Message
   Spinner animation (pulsing)
   Stays until response arrives
```

---

## Component Interaction Diagram

```
┌──────────────────────────────────────────────────────────┐
│                   HTML Player                            │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │ app.js (Main Application)                       │    │
│  │                                                  │    │
│  │ ┌─────────────────────────────────────────────┐ │    │
│  │ │ initApp()                                   │ │    │
│  │ │  ├─ initAuth()  ◄──┐                        │ │    │
│  │ │  ├─ initDOM()      │                        │ │    │
│  │ │  ├─ loadSettings() │                        │ │    │
│  │ │  └─ ...            │                        │ │    │
│  │ └────────────────────┼─────────────────────────┘ │    │
│  │                      │                            │    │
│  │                      └─► auth.js ◄──┐            │    │
│  │                          Manages     │            │    │
│  │                          ├─ Login    │            │    │
│  │                          ├─ Register │            │    │
│  │                          ├─ Logout   │            │    │
│  │                          └─ Tokens   │            │    │
│  │                                      │            │    │
│  │                   navidrome-      ───┘            │    │
│  │                   integration.js                  │    │
│  │                   Provides                        │    │
│  │                   ├─ getSongs()                   │    │
│  │                   ├─ getPlaylists()               │    │
│  │                   ├─ starSong()                   │    │
│  │                   └─ ...                          │    │
│  │                                                  │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ index.html (DOM Elements)                        │   │
│  │ ├─ #authPanel        ◄──┐                       │   │
│  │ │  ├─ #authUsername   │  │                      │   │
│  │ │  ├─ #authPassword   │  │ Manipulated by       │   │
│  │ │  ├─ #authLoginBtn   │  │ auth.js              │   │
│  │ │  ├─ #authRegisterBtn│  │                      │   │
│  │ │  └─ #authStatus     │  │                      │   │
│  │ │                     │  │                      │   │
│  │ ├─ #userInfo         ◄──┘                       │   │
│  │ │  ├─ #currentUsername                          │   │
│  │ │  └─ #logoutBtn                                │   │
│  │ │                                               │   │
│  │ └─ [Other player elements]                      │   │
│  │                                                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ CSS (Styling)                                    │   │
│  │ ├─ css/main.css                                 │   │
│  │ │  └─ @import 'auth.css'  ◄────┐               │   │
│  │ │                               │               │   │
│  │ └─ css/auth.css                 │               │   │
│  │    ├─ .auth-panel               │               │   │
│  │    ├─ .auth-panel-content       │ Applied to   │   │
│  │    ├─ .auth-input               │ HTML         │   │
│  │    ├─ .auth-btn                 │ elements     │   │
│  │    └─ .user-info                │               │   │
│  │                                  │               │   │
│  └──────────────────────────────────┼───────────────┘   │
│                                      │                   │
│  ┌──────────────────────────────────▼────────────────┐  │
│  │ localStorage                                       │  │
│  │ ├─ auth_token: "eyJhbGc..."                       │  │
│  │ └─ auth_username: "username"                      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## Deployment Architecture Example (Heroku)

```
┌─────────────────────────────────────────────────────────────┐
│                    Internet (HTTPS)                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────┐        ┌─────────────────┐            │
│  │  User 1         │        │  User 2         │            │
│  │  Browser        │        │  Browser        │            │
│  │  localhost:5500 │        │  smartphone     │            │
│  └────────┬────────┘        └────────┬────────┘            │
│           │                          │                      │
│           └──────────────┬───────────┘                      │
│                          │                                  │
│          Both connect to:                                  │
│    https://your-app.herokuapp.com                          │
│                          │                                  │
│           ┌──────────────▼──────────────┐                 │
│           │                             │                 │
│    ┌──────▼─────────────────────────┐   │                 │
│    │  Heroku Dyno (server process)  │   │                 │
│    │                                 │   │                 │
│    │  ┌──────────────────────────┐   │   │                 │
│    │  │  Node.js + Express       │   │   │                 │
│    │  │  ┌────────────────────┐  │   │   │                 │
│    │  │  │  Routes:           │  │   │   │                 │
│    │  │  │  POST /register    │  │   │   │                 │
│    │  │  │  POST /login       │  │   │   │                 │
│    │  │  │  POST /verify-token│  │   │   │                 │
│    │  │  └────────────────────┘  │   │   │                 │
│    │  └─────────┬────────────────┘   │   │                 │
│    │            │                    │   │                 │
│    │  ┌─────────▼────────────────┐   │   │                 │
│    │  │  SQLite Database         │   │   │                 │
│    │  │  users.db                │   │   │                 │
│    │  │  (Persistent filesystem) │   │   │                 │
│    │  └──────────────────────────┘   │   │                 │
│    │                                 │   │                 │
│    └─────────────────────────────────┘   │                 │
│           Heroku (Platform)            │                 │
│                                  ┌──────▼──────────────┐  │
│                                  │ Heroku Postgres    │  │
│                                  │ (Optional upgrade) │  │
│                                  └───────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
                           │
                           │ Authenticated requests
                           │ with JWT token
                           │
                  ┌────────▼────────┐
                  │                 │
                  │  Navidrome API  │
                  │                 │
                  │ music.yourdomain│
                  │ .life            │
                  │                 │
                  └─────────────────┘
```

---

## Error Handling Flow

```
User submits login form
  │
  ▼
Frontend validation
  ├─ Username empty?   ──► Show error: "Enter username"
  ├─ Password empty?   ──► Show error: "Enter password"
  ├─ Username < 3 chars? ──► Show error: "Min 3 characters"
  ├─ Password < 6 chars?  ──► Show error: "Min 6 characters"
  │
  ├─ All valid ──┐
  │              ▼
  │         Send to API
  │              │
  │              ▼
  │         Backend validation
  │              │
  │         ┌────┼────┐
  │         │    │    │
  │    User │    │  Invalid
  │  exists?│    │  format?
  │    │    │    │    │
  │    ▼    ▼    ▼    ▼
  │   No   Yes  Yes  Error
  │    │    │    │    │
  │    ▼    ▼    ▼    ▼
  │   401  Check  400  400
  │   │    pass  │    │
  │   │    │     │    └─ Show: "Invalid input"
  │   │    ├─────┘
  │   │    │
  │   │  Match?
  │   │    │
  │   │ ┌──┴──┐
  │   │ │     │
  │   │ ▼     ▼
  │   │ ✓    ✗
  │   │ │    │
  │   │ │    └─ 401 "Invalid credentials"
  │   │ │
  │   └─┼─ Return 401 "Invalid username or password"
  │     │
  │     ▼
  │   Generate JWT
  │     │
  │     ▼
  │   200 OK + Token
  │     │
  │     ▼
  │   Save to localStorage
  │     │
  │     ▼
  │   Show success
  │
  └─ Network error ─► Show: "Connection error"
  │
  └─ Server error ──► Show: "Server error (500)"
```

---

## This covers all the architecture and flow diagrams for the authentication system!

For more details, refer to:
- [AUTH_SETUP.md](AUTH_SETUP.md) - Complete setup guide
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Project overview
- [js/auth.js](js/auth.js) - Frontend code
- [server.js](server.js) - Backend code
