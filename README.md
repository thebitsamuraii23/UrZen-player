# 🎵 Z BETA — Modern Audio Player with Navidrome Integration

A sleek, minimalist web-based audio player with playlist management, Bass Boost, Zen Mode, and **Navidrome streaming integration**. Your music is stored locally in IndexedDB with full privacy, plus you can search and stream from Navidrome.

## ✨ Features

- 🎯 **Playlist Management** - Create, delete, and organize playlists with ease
- 🎼 **Multi-Select Playlists** - Add one song to multiple playlists simultaneously
- 🔊 **Bass Boost** - EQ with bass adjustment (0-25 dB)
- 🔀 **Shuffle & Repeat** - Mix it up or loop your favorites
- ❤️ **Favorites** - Mark and quick-access your favorite tracks
- 🖱️ **Drag & Drop** - Reorder songs in your library intuitively
- 🌙 **Zen Mode** (F key) - Immersive fullscreen experience with enhanced visualizer
- 🎨 **Metadata Extraction** - Automatic title, artist, and album art detection
- 🌍 **Multi-Language** - English and Russian support
- 🌐 **Navidrome Integration** - Search and stream music from Navidrome server
- 👤 **User Authentication** - Register/login with JWT tokens
- ⌨️ **Keyboard Shortcuts**:
  - `Space` — Play/Pause
  - `← / →` — Seek ±10 seconds
  - `↑ / ↓` — Volume control
  - `Ctrl+← / Ctrl+→` — Previous/Next track
  - `F` — Zen Mode
  - `ESC` — Exit Zen Mode

## 📁 Project Structure

```
html-player/
├── index.html              # Main application file
├── server.js               # Express.js backend with auth
├── Dockerfile              # Docker container definition
├── docker-compose.yml      # Docker compose configuration
├── css/
│   └── main.css           # Complete styling
├── js/
│   ├── app.js             # Core application logic
│   ├── auth.js            # Authentication system
│   ├── navidrome-search.js # Navidrome API integration
│   └── state.js           # Global state management
├── assets/
│   └── musicjacker.png    # Music Jacker icon
├── README.md              # This documentation
└── LICENSE                # MIT License
```

## 🚀 Quick Start (Local Development)

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start the backend server** (in another terminal)
   ```bash
   npm start
   ```

3. **Open** in your browser
   - If using Live Server: `http://localhost:5500`
   - If using Node server: `http://localhost:3001`

4. **Import music** using the "Import Tracks" button

5. **Search & Stream** - Use the top search bar to:
   - Search local library (files you imported)
   - Search Navidrome server (automatic fallback with guest credentials)

## 🐳 Docker Deployment

### Prerequisites
- Docker and Docker Compose installed
- Navidrome server accessible at `https://music.youtubemusicdownloader.life`

### Quick Start with Docker

1. **Build and start the container**
   ```bash
   docker-compose up -d
   ```

2. **Access the application**
   - Open `http://localhost:3001` in your browser

3. **View logs**
   ```bash
   docker-compose logs -f app
   ```

4. **Stop the container**
   ```bash
   docker-compose down
   ```

### Docker Setup Includes
- ✅ Node.js runtime
- ✅ SQLite database (persistent volume at `./data/`)
- ✅ Static file serving
- ✅ Health checks
- ✅ Auto-restart on failure
- ✅ Network isolation

### Environment Variables

In `docker-compose.yml`, you can customize:
```yaml
environment:
  - NODE_ENV=production           # production or development
  - PORT=3001                      # Server port
  - DB_PATH=/app/data/music.db    # Database location (in volume)
```

### Volume Mounts

- **`./data`** - SQLite database and user data
- **`./music`** - Optional: mount your music library directory

## 👤 Authentication System

### User Registration & Login

1. Click the **Login** button in the top-right navigation
2. **New User?** Switch to the "Register" tab
3. Create your account with username and password
4. Your credentials are securely hashed with bcrypt
5. Automatic login after registration
6. JWT tokens expire after 7 days

### Token Management

- Tokens stored in browser `localStorage`
- Automatically validated on page load
- Username displayed in top navigation
- Click your username → **Logout** to clear session

### Security Notes

- All passwords are bcrypt hashed before database storage
- JWT tokens use HS256 encryption
- Local playlists and library remain private to your account
- Navidrome integration uses guest credentials (no account needed)

## 🌐 Navidrome Integration

### Automatic Guest Access

- Search bar (top of player) automatically searches Navidrome
- Guest credentials: `guest/guest` (pre-configured)
- No login required for streaming
- Results show source badge (🌐 Navidrome vs 📁 Local)

### Combined Search

1. **Type in top search bar** - searches both local & Navidrome simultaneously
2. **Local results** appear first (files you imported)
3. **Navidrome results** appear below
4. **Duplicates** automatically removed by title/artist
5. **Click any song** to play (works with both local & streamed)

### API Details

- **Navidrome Server**: `https://music.youtubemusicdownloader.life`
- **API Method**: Subsonic API (search3.view, stream.view)
- **Format**: REST with JSON responses
- **Version**: 1.16.1

### Streaming

- Songs stream directly from Navidrome in real-time
- No local storage required
- Works with existing player controls
- Playback duration and progress tracking included

## 🎮 Core Features Explained

### Create & Manage Playlists

- Click **+** icon on any track
- Select multiple playlists to add the song to
- Changes save instantly to local storage

### Add to Multiple Playlists

- One song can belong to many playlists
- Removing from a playlist doesn't delete the track
- Just hover over a track and click **+** to manage

### Bass Boost Control

- Settings ⚙️ → "Ultra Bass" (toggle) → Adjust slider (0-25 dB)
- Real-time audio processing with Web Audio API

### Zen Mode Experience

- Press **F** or click the Zen Mode button
- Immersive fullscreen with enhanced visualizer
- Perfect for focused listening

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `← / →` | Seek ±10 seconds |
| `↑ / ↓` | Volume |
| `Ctrl+← / →` | Previous/Next |
| `F` | Zen Mode Toggle |
| `ESC` | Exit Zen Mode |

## 💾 Data Storage

- **IndexedDB** — Local browser storage for complete privacy
- **Zero cloud sync** — Your music stays on your device
- **Clear data** — Settings → "Wipe Data" option available

## 🛠️ Technical Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Audio**: Web Audio API with BiquadFilter for Bass Boost
- **Database**: Dexie.js (IndexedDB wrapper)
- **Icons**: Lucide Icons
- **Metadata**: jsmediatags for ID3 extraction

## 📦 Built With

- **Vanilla JavaScript** - No frameworks needed
- **Modern CSS** - Glassmorphism design
- **Web Audio API** - Professional audio processing
- **IndexedDB** - Fast local storage

## 🔗 My Other Projects

- 🤖 **Music Jacker Bot** — [t.me/ytdlpload_bot](https://t.me/ytdlpload_bot) - Telegram bot for music
- 🌐 **Music Jacker Website** — [musicjacker-site.onrender.com](https://musicjacker-site.onrender.com)
- 📄 **My Resume** — [samuraizz-resume.githuib.io/samuraizz-resume](https://samuraizz-resume.githuib.io/samuraizz-resume)

## 📊 Recent Updates

### v2.0 - Modern UI Overhaul
- ✅ Modular architecture with clean separation
- ✅ Beautiful modal dialogs for playlist operations
- ✅ Interactive playlist picker with visual feedback
- ✅ English as default language
- ✅ Animated settings panel with hover effects
- ✅ Clear Queue button for quick playlist management

## 🎨 UI/UX Highlights

- **Dark Theme** with accent orange (#ff3e00)
- **Glassmorphic Design** with blur effects
- **Smooth Animations** throughout the interface
- **Responsive Layout** for desktop and tablet
- **Intuitive Controls** with clear visual feedback

## 🔐 Privacy First

- No tracking
- No ads
- No data collection
- Everything stays on your device

## 📜 License

MIT License © 2026 - Feel free to use, modify, and distribute

---

**Made with ❤️ by [thebitsamuraii23](https://github.com/thebitsamuraii23)**

**Enjoy your music! 🎧**


**Website is still in development and many features can be buggy or some features may be added.**
**Thanks for your understanding!**
