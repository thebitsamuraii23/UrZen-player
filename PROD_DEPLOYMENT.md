# Production Structure

```
z-player/
├── backend/
│   ├── Dockerfile
│   ├── server.js
│   ├── package.json
│   └── package-lock.json
│
├── frontend/
│   ├── Dockerfile
│   ├── index.html
│   ├── css/
│   ├── js/
│   ├── assets/
│   ├── package.json
│   └── package-lock.json
│
├── nginx/
│   └── nginx.conf
│
├── docker-compose.yml
├── .env.production
├── deploy.sh
└── data/ (created at runtime)
```

## Architecture

```
┌──────────────────────────────────────────┐
│      Cloudflare Zero Trust Tunnel        │
│      (player.youtubemusicdownloader.life)│
└──────────────────┬───────────────────────┘
                   │ HTTPS
                   ▼
        ┌──────────────────────┐
        │   nginx (127.0.0.1)  │
        │   Port: 8080         │
        └────┬──────────┬──────┘
             │          │
    ┌────────▼─┐   ┌────▼──────────┐
    │ Frontend  │   │   /api/       │
    │  (SPA)    │   │   ▼           │
    │ Port: 80  │   │ Backend       │
    │           │   │ Port: 3001    │
    └───────────┘   └───────┬───────┘
                            │
                    ┌───────▼────────┐
                    │    SQLite DB   │
                    │   /data/       │
                    └────────────────┘
```

## Key Points

1. **No direct port exposure** - nginx only on 127.0.0.1:8080
2. **Service communication** - backend:3001, not localhost:3001
3. **Single entry point** - nginx reverse proxy
4. **Database persistence** - Docker volume db_data
5. **Cloudflare tunnel** - HTTPS/TLS termination
6. **Health checks** - auto-restart on failure
7. **Log rotation** - 10MB max, 3 files

## Deployment

```bash
# 1. Set environment
export JWT_SECRET=$(openssl rand -base64 32)
export TUNNEL_TOKEN="<your-tunnel-token>"

# 2. Copy to production
scp -r z-player/ user@server:~

# 3. Deploy
cd z-player
./deploy.sh

# 4. Monitor
docker-compose logs -f
```

## Verification

```bash
# Local access (on server)
curl -v http://127.0.0.1:8080/

# API test
curl -v http://127.0.0.1:8080/api/health

# Container status
docker-compose ps

# Logs
docker-compose logs backend
docker-compose logs nginx
docker-compose logs cloudflared
```
