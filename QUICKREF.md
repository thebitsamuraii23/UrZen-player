# 🚀 Quick Reference Guide

## 30-Second Setup

```bash
# Development
npm install && npm start
# Then open http://localhost:3001 in browser

# Production (Docker)
docker-compose up -d
# Then open http://localhost:3001 in browser
```

## Key Features

| Feature | How to Use | Notes |
|---------|-----------|-------|
| **Search** | Top search bar | Local + Navidrome combined |
| **Play Song** | Click any result | Works for local and streamed songs |
| **Register** | Click Login → Register | Creates JWT token (7 days) |
| **Upload Music** | Import Tracks button | Stores locally in IndexedDB |
| **Playlists** | Click + on any song | Multi-select available |
| **Stream** | Search for song → Play | Uses guest access (guest/guest) |
| **Zen Mode** | Press F key | Fullscreen immersive mode |

## Important Endpoints

| Endpoint | Purpose | Auth |
|----------|---------|------|
| `GET /health` | Server status | None |
| `POST /login` | User login | Username/password |
| `POST /register` | User signup | Username/password |
| `POST /verify-token` | Token validation | JWT token |
| `GET / + /*` | Serve frontend | None |

## Configuration

### Environment Variables (Production)

```bash
NODE_ENV=production
JWT_SECRET=your-super-secret-here
DB_PATH=/app/data/music.db
PORT=3001
```

### Docker Override

Edit `docker-compose.yml` environment section or create `.env`:
```env
JWT_SECRET=production-secret-key
```

## Common Commands

### Development
```bash
npm install          # Install dependencies
npm start           # Start server (localhost:3001)
npm test            # Run tests (if configured)
npm run dev         # Dev mode with nodemon
```

### Docker
```bash
docker-compose up -d              # Start
docker-compose logs -f app        # View logs
docker-compose ps                 # Check status
docker-compose down               # Stop
docker-compose down -v            # Stop + remove volumes
```

### Database
```bash
# Backup
cp users.db users.db.backup

# Reset
rm users.db
# Restart server to recreate

# Query
sqlite3 users.db ".tables"
sqlite3 users.db "SELECT COUNT(*) FROM users;"
```

## Troubleshooting

### "Port 3001 already in use"
```bash
# Find process
lsof -i :3001
# Kill it
kill -9 <PID>
```

### "Database locked"
```bash
# Restart server
docker-compose restart app
# Or manually: npm restart
```

### "Search returns no results"
```bash
# Check Navidrome connectivity
curl "https://music.youtubemusicdownloader.life/rest/search3.view?u=guest&p=guest&v=1.16.1&c=Z-BETA&f=json&query=test"

# Check browser console
F12 → Console tab → Search for errors
```

### "Can't login"
```bash
# Clear browser storage
F12 → Application → Storage → Clear All

# Restart server
npm restart

# Check database exists
ls -la users.db
```

## File Structure

```
html-player/
├── index.html           # Main UI
├── server.js            # Backend API
├── package.json         # Dependencies
├── Dockerfile           # Docker image
├── docker-compose.yml   # Docker orchestration
├── js/
│   ├── app.js          # Main logic
│   ├── auth.js         # Authentication
│   ├── navidrome-search.js  # NEW: Search
│   └── state.js        # Global state
├── css/
│   └── main.css        # Styling
└── README.md           # Full documentation
```

## API Examples

### Register User
```bash
curl -X POST http://localhost:3001/register \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"pass"}'
```

### Login
```bash
curl -X POST http://localhost:3001/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"pass"}'
```

### Verify Token
```bash
curl -X POST http://localhost:3001/verify-token \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_JWT_TOKEN"}'
```

### Health Check
```bash
curl http://localhost:3001/health
```

## Search API (Client-Side)

```javascript
// Search combined (local + Navidrome)
const results = await window.performCombinedSearch("rock");

// Search only Navidrome
const nav = await window.searchNavidrome("jazz");

// Search only local
const local = await window.searchLocalLibrary("blues");

// Play Navidrome song
await window.playNavidromeSong("songId", "Title", "Artist");

// Get stream URL
const url = window.getNavidromeStreamUrl("songId");
```

## Performance Tips

1. **Limit search results:** Edit line 64 in navidrome-search.js
2. **Cache searches:** Results auto-deduplicate
3. **Use local first:** Local search is instant (~0ms)
4. **Monitor memory:** `docker stats z-beta-player`
5. **Optimize images:** Reduce cover art size

## Security Checklist

- [ ] Change JWT_SECRET before production
- [ ] Use HTTPS/SSL in production
- [ ] Don't commit .env or secrets
- [ ] Keep dependencies updated: `npm audit fix`
- [ ] Use strong passwords
- [ ] Enable backups

## Deployment Checklist

- [ ] Update `package.json` version
- [ ] Set production environment variables
- [ ] Generate strong JWT secret
- [ ] Set up SSL certificate
- [ ] Configure domain/proxy
- [ ] Enable backups
- [ ] Test health endpoint
- [ ] Test search functionality
- [ ] Test user registration/login
- [ ] Monitor logs

## Docker Deployment (Step-by-Step)

```bash
# 1. Clone/navigate to project
cd html-player

# 2. Build image (first time only)
docker build -t z-beta .

# 3. Start with compose
docker-compose up -d

# 4. Wait for health check (30 seconds)
sleep 30
curl http://localhost:3001/health

# 5. Access application
open http://localhost:3001

# 6. View logs if issues
docker-compose logs app
```

## Emergency Procedures

### Database Corruption
```bash
# Backup and reset
cp users.db users.db.corrupt
rm users.db
docker-compose down
docker-compose up -d
```

### Container Won't Start
```bash
# Check logs
docker-compose logs app

# Rebuild from scratch
docker-compose down -v
docker-compose up -d --build
```

### Out of Disk Space
```bash
# Clean Docker
docker system prune -a

# Remove old backups
rm -rf backups/*.db~
```

## Resources

- **Navidrome:** https://www.navidrome.org/
- **Subsonic API:** https://www.subsonic.org/pages/api.jsp
- **Docker:** https://docs.docker.com/
- **Express.js:** https://expressjs.com/
- **JWT:** https://jwt.io/

## Support

1. **Check logs:** `docker-compose logs app`
2. **Read docs:** See README.md and DEPLOYMENT.md
3. **Search issues:** Check GitHub issues
4. **Test manually:** Use curl commands above

---

**Last Updated:** 2024  
**Version:** 2.0  
**Status:** Production Ready ✅
