# UrZen Player

[![Stars](https://img.shields.io/github/stars/thebitsamuraii23/UrZen-player?style=for-the-badge)](https://github.com/thebitsamuraii23/UrZen-player/stargazers)
[![Forks](https://img.shields.io/github/forks/thebitsamuraii23/UrZen-player?style=for-the-badge)](https://github.com/thebitsamuraii23/UrZen-player/network/members)
[![License](https://img.shields.io/github/license/thebitsamuraii23/UrZen-player?style=for-the-badge)](./LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/thebitsamuraii23/UrZen-player/tests/updates?style=for-the-badge)](https://github.com/thebitsamuraii23/UrZen-player/commits/tests/updates)
[![TypeScript First](https://img.shields.io/badge/TypeScript-First-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Groq AI](https://img.shields.io/badge/AI-Groq%20Integration-ff4f64?style=for-the-badge)](https://groq.com/)
[![Navidrome](https://img.shields.io/badge/Navidrome-Subsonic%20API-2E3440?style=for-the-badge)](https://www.navidrome.org/)

A modern web music player focused on real listening workflows: local tracks, Navidrome streaming, AI-assisted playlist creation, smart shuffle continuation, and fast queue control.

## Highlights

- Full TypeScript migration across frontend and backend.
- AI Playlist Builder (Groq): create playlists from natural language prompts.
- Smart Shuffle AI: continues playback with relevant tracks from your library.
- Mini Player first UX with queue modal and drag-and-drop reordering.
- Mobile UX refresh: old fullscreen mobile player removed, page-level scrolling improved.
- In-app Update Logs page for release notes and feature history.

## Core Features

### Playback and Library

- Local library import with metadata extraction.
- Navidrome search + streaming in the same app.
- Unified queue for local and Navidrome tracks.
- Shuffle, repeat, favorites, and keyboard shortcuts.
- Zen Mode for focused playback.

### Queue and Control

- "Play next" behavior with playback-order aware queue rendering.
- Mini queue modal with upcoming order indicators.
- Drag-and-drop queue reordering.
- Smart shuffle tail integration.

### AI Features

- `Create playlist using AI` in UI (no browser prompt fallback needed when modal is available).
- Prompt parsing + ranking via Groq.
- Navidrome-aware candidate discovery.
- Smart shuffle endpoint for contextual continuation.

## Tech Stack

- Frontend: HTML, CSS, TypeScript (vanilla modules)
- Backend: Node.js, Express, TypeScript runtime via `tsx`
- Database: SQLite
- Auth: JWT + bcrypt
- Local storage: IndexedDB (Dexie in browser)
- External APIs: Navidrome (Subsonic API), Groq API

## Project Structure

```text
.
├── src/
│   ├── server.ts
│   ├── backend/server.ts
│   ├── client/
│   │   ├── app.ts
│   │   ├── auth.ts
│   │   ├── database.ts
│   │   ├── i18n.ts
│   │   ├── navidrome-search.ts
│   │   └── modules/
│   └── modules/playlist-utils.ts
├── css/
├── assets/
├── index.html
├── frontend/
│   ├── index.html
│   └── css/
├── package.json
└── tsconfig.json
```

## Getting Started (Local)

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Start server

```bash
npm start
```

### Dev mode (watch)

```bash
npm run dev
```

### Open app

- `http://localhost:3001`

## Environment Variables

Set environment variables in your shell, container, or deployment platform.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP server port |
| `DB_PATH` | `./users.db` | SQLite database path |
| `JWT_SECRET` | `your-secret-key-change-this-in-production` | JWT signing secret |
| `DEFAULT_NAVIDROME_SERVER` | preset URL | default Navidrome server |
| `DEFAULT_NAVIDROME_USER` | `guest` | default Navidrome user |
| `DEFAULT_NAVIDROME_PASS` | `guest` | default Navidrome password |
| `GROQ_API_KEY` | empty | enables AI playlist + smart shuffle ranking |
| `GROQ_API_URL` | Groq chat completions endpoint | custom Groq endpoint |
| `GROQ_MODEL` | `llama-3.1-8b-instant` | Groq model name |
| `MAX_UPLOAD_BYTES` | `209715200` | max local upload size |

Example:

```bash
GROQ_API_KEY=your_key_here JWT_SECRET=change_me npm start
```

## AI Endpoints

- `POST /api/ai/create-playlist`
- `POST /api/ai/smart-shuffle`

Both endpoints require authentication.

## Keyboard Shortcuts

- `Space`: Play/Pause
- `Left / Right`: Seek -/+10s
- `Ctrl + Left / Right`: Previous/Next track
- `Up / Down`: Volume
- `F`: Toggle Zen Mode
- `Esc`: Exit Zen Mode / close About/Update Logs overlay

## Deployment Notes

- App serves static assets from:
  - `/css` -> `css/`
  - `/assets` -> `assets/`
  - `/ts` -> `src/client/`
- Health endpoint: `GET /health`
- Docker-related files are included (`Dockerfile`, `docker-compose.yml`, `frontend/Dockerfile`).

## Privacy

- Local tracks remain under your own storage and account scope.
- User auth uses hashed passwords and JWT.
- No mandatory cloud sync layer.

## License

MIT License. See [LICENSE](./LICENSE).

---

Built by [thebitsamuraii23](https://github.com/thebitsamuraii23).
