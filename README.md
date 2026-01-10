# 🎵 Z BETA — Modern Audio Player

A sleek, minimalist web-based audio player with playlist management, Bass Boost, and Zen Mode. Your music is stored locally in IndexedDB with full privacy.

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
├── css/
│   └── main.css           # Complete styling
├── js/
│   ├── app.js             # Core application logic
│   └── state.js           # Global state management
├── assets/
│   └── musicjacker.png    # Music Jacker icon
├── README.md              # This documentation
└── LICENSE                # MIT License
```

## 🚀 Quick Start

1. **Open** `index.html` in your browser
2. **Import music** using the "Import Tracks" button
3. **Enjoy** — Metadata loads automatically with beautiful UI

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
