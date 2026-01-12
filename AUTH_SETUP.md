# Z BETA - Authentication Setup Guide

This guide covers the complete setup of the authentication system (backend + frontend) for the Z BETA music player.

## 📋 Project Structure

```
html-player/
├── server.js              # Express API server
├── package.json           # Node.js dependencies
├── index.html             # Updated with login panel
├── css/
│   └── auth.css          # Glassmorphism login styles
├── js/
│   ├── app.js            # Updated with auth initialization
│   └── auth.js           # Authentication logic
└── users.db              # SQLite database (auto-created)
```

## 🚀 Backend Setup (Node.js + Express + SQLite)

### 1. Install Dependencies

```bash
cd /workspaces/html-player
npm install
```

This installs:
- **express** - Web framework
- **better-sqlite3** - SQLite database
- **bcrypt** - Password hashing
- **jsonwebtoken** - JWT token generation
- **cors** - Cross-origin requests

### 2. Environment Variables (Optional)

Create a `.env` file in the root directory:

```env
PORT=3001
JWT_SECRET=your-super-secret-key-change-this-in-production
NODE_ENV=development
```

If not provided, defaults are:
- `PORT=3001`
- `JWT_SECRET=your-secret-key-change-this-in-production`

### 3. Run the Server

**Development:**
```bash
npm start
```

**Development with auto-restart (requires nodemon):**
```bash
npm run dev
```

The server will start at `http://localhost:3001`

## 📡 Backend API Endpoints

### POST /register
Register a new user

**Request:**
```json
{
  "username": "john_doe",
  "password": "securePassword123"
}
```

**Response (Success - 201):**
```json
{
  "message": "User registered successfully",
  "userId": 1
}
```

**Response (Error - 400):**
```json
{
  "error": "Username already taken"
}
```

**Validation Rules:**
- Username: minimum 3 characters, must be unique
- Password: minimum 6 characters

---

### POST /login
Authenticate user and get JWT token

**Request:**
```json
{
  "username": "john_doe",
  "password": "securePassword123"
}
```

**Response (Success - 200):**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "username": "john_doe"
}
```

**Response (Error - 401):**
```json
{
  "error": "Invalid username or password"
}
```

---

### POST /verify-token
Verify JWT token validity

**Request:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (Valid - 200):**
```json
{
  "valid": true,
  "username": "john_doe",
  "userId": 1
}
```

**Response (Invalid - 401):**
```json
{
  "valid": false,
  "error": "Invalid or expired token"
}
```

---

### GET /health
Server health check

**Response:**
```json
{
  "status": "Server is running"
}
```

## 🎨 Frontend - Login Panel

The login panel has been integrated into the HTML player with glassmorphism design.

### Features:
✅ **Glassmorphism Design** - Semi-transparent panel with blur effect
✅ **Smooth Animations** - CSS transitions and keyframe animations
✅ **Responsive** - Works on desktop, tablet, and mobile
✅ **Real-time Validation** - Client-side input validation
✅ **Status Messages** - Success, error, and loading states
✅ **JWT Storage** - Tokens saved in localStorage
✅ **Auto-verification** - Checks token validity on page load

### Location
The login panel is positioned at the **bottom-left** of the sidebar, **above the Settings button**.

### State Transitions:
1. **Initial State** - Show login/register inputs
2. **Loading** - Show loading message during request
3. **Success** - Show authenticated user info with logout button
4. **Error** - Show error message (auto-clears after 3s)

## 🔐 Security Features

### Backend:
- **Password Hashing** - bcrypt with salt rounds (10)
- **JWT Tokens** - 7-day expiration
- **Input Validation** - Username and password length checks
- **SQL Injection Protection** - Prepared statements
- **CORS** - Whitelist specific origins

### Frontend:
- **localStorage** - Secure token storage (consider httpOnly cookie for production)
- **Token Verification** - Checks token validity on init
- **Automatic Logout** - On token expiration

## 📱 Frontend Functions

All functions are exposed globally via `window` object:

### Authentication Functions:

```javascript
// Login
window.handleLogin()
// Logs in with username/password from inputs

// Register
window.handleRegister()
// Registers new user with validation

// Logout
window.handleLogout()
// Clears auth data and shows login panel
```

### Imported Functions (in auth.js):

```javascript
// Check if user is authenticated
isAuthenticated() // returns boolean

// Get current user
getCurrentUser() // returns { username, token }

// Get auth headers for API requests
getAuthHeaders() // returns { Authorization: 'Bearer ...', ... }

// Make authenticated requests to Navidrome
navidromeRequest(endpoint, options) // returns Response
```

## 🔗 Navidrome Integration

The authentication system is fully integrated with Navidrome API:

```javascript
import { navidromeRequest, isAuthenticated } from './js/auth.js';

// Check if user is authenticated
if (isAuthenticated()) {
  // Make request to Navidrome API
  const response = await navidromeRequest('/api/playlists', {
    method: 'GET'
  });
  
  const data = await response.json();
  console.log('Playlists:', data);
}
```

**Navidrome API URL:**
```
https://music.youtubemusicdownloader.life
```

**Example Integration:**
```javascript
// Get user's music library from Navidrome
const response = await navidromeRequest('/api/songs', { method: 'GET' });
const songs = await response.json();

// Get playlists
const response = await navidromeRequest('/api/playlists', { method: 'GET' });
const playlists = await response.json();
```

## 🛠️ Configuration

### Update API URL

If your backend is on a different server, update `AUTH_API_URL` in `js/auth.js`:

```javascript
const AUTH_API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-api-domain.com'  // Change this
  : 'http://localhost:3001';
```

### Update Navidrome URL

Update `NAVIDROME_API` in `js/auth.js`:

```javascript
const NAVIDROME_API = 'https://music.youtubemusicdownloader.life';
```

### CORS Configuration

Update the CORS whitelist in `server.js`:

```javascript
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5500', 'https://your-domain.com'],
  credentials: true
}));
```

## 🐛 Troubleshooting

### "Connection error. Is the server running?"
- Check if `npm start` is running
- Verify server is at `http://localhost:3001`
- Check browser console for CORS errors
- Ensure `AUTH_API_URL` is correct in `js/auth.js`

### "Invalid or expired token"
- Token may have expired (7-day expiration)
- Login again to get a fresh token
- Clear localStorage: `localStorage.clear()`

### Database locked error
- Another instance of the server is running
- Kill the process: `pkill -f "node server.js"`
- Or use different port: `PORT=3002 npm start`

### CORS errors
- Update the `origin` array in `server.js`
- Add your domain/port to whitelist
- Ensure frontend and backend are on same or whitelisted origins

## 📊 Database Schema

SQLite `users` table:
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## 🔐 Production Checklist

Before deploying to production:

- [ ] Change `JWT_SECRET` environment variable
- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS for API
- [ ] Update CORS `origin` whitelist
- [ ] Enable httpOnly, Secure cookies instead of localStorage
- [ ] Add rate limiting to `/register` and `/login`
- [ ] Implement password reset flow
- [ ] Add refresh token mechanism
- [ ] Set up HTTPS for Navidrome API
- [ ] Add logging and monitoring
- [ ] Use environment variables for all secrets
- [ ] Consider adding 2FA

## 📚 Example Usage

### Complete Flow:

```javascript
// 1. User registers
fetch('http://localhost:3001/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'newuser', password: 'pass123' })
});

// 2. User logs in
fetch('http://localhost:3001/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'newuser', password: 'pass123' })
})
.then(r => r.json())
.then(data => {
  // data.token is JWT
  localStorage.setItem('auth_token', data.token);
});

// 3. Use token for API requests
const token = localStorage.getItem('auth_token');
fetch('https://music.youtubemusicdownloader.life/api/songs', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## 🚀 Deployment Options

### Option 1: Heroku
```bash
# Install Heroku CLI
# Create Procfile
echo "web: npm start" > Procfile

# Deploy
heroku create your-app-name
git push heroku main
```

### Option 2: Railway
```bash
# Install Railway CLI
# Link repository
railway link

# Deploy
railway up
```

### Option 3: Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

## 📞 Support

For issues or questions:
1. Check the troubleshooting section
2. Review the server logs: `npm start` output
3. Check browser console: F12 > Console tab
4. Verify API endpoints are responding: Visit `http://localhost:3001/health`

## 📄 License

See LICENSE file in the project root.

---

**Version:** 1.0.0  
**Last Updated:** January 2026
