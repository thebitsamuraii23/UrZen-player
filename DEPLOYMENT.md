# 🚀 Z BETA Deployment Guide

## Quick Start Comparison

| Method | Effort | Scalability | Cost | Best For |
|--------|--------|-------------|------|----------|
| **Docker** | ⭐⭐ | ⭐⭐⭐⭐⭐ | Low | Production |
| **Manual** | ⭐⭐⭐ | ⭐⭐ | Free | Development |
| **Cloud** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Variable | Enterprise |

---

## Option 1: Docker Deployment (Recommended)

### Prerequisites
- Docker 20.10+
- Docker Compose 1.29+
- 500MB free disk space

### One-Command Deploy

```bash
cd html-player
docker-compose up -d
```

Access at: `http://localhost:3001`

### Check Status

```bash
# View logs
docker-compose logs -f app

# Check health
curl http://localhost:3001/health

# Stop
docker-compose down
```

### Production Configuration

**1. Change JWT Secret:**
```bash
# Generate a strong secret
openssl rand -base64 32
```

**2. Update docker-compose.yml:**
```yaml
environment:
  - JWT_SECRET=your-generated-secret
  - NODE_ENV=production
```

**3. Enable SSL with nginx reverse proxy:**
```nginx
server {
  listen 443 ssl;
  server_name your-domain.com;
  
  ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
  
  location / {
    proxy_pass http://localhost:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

### Backup Strategy

```bash
# Daily backup
docker cp z-beta-player:/app/data/music.db ./backups/music-$(date +%Y%m%d).db

# Or with cron
0 2 * * * docker cp z-beta-player:/app/data/music.db /backups/music-$(date +\%Y\%m\%d).db
```

---

## Option 2: Manual Installation (Development)

### Prerequisites
- Node.js 16+ (check: `node -v`)
- npm 7+ (check: `npm -v`)

### Setup

```bash
# Clone repo (or navigate to directory)
cd html-player

# Install dependencies
npm install

# Start server (Terminal 1)
npm start

# Serve frontend (Terminal 2)
# Option A: VSCode Live Server (right-click index.html)
# Option B: npx serve .
# Option C: Manually visit http://localhost:3001
```

### Features When Running Manually
- Auto-restart on file changes (with nodemon)
- Hot reload with browser LiveReload
- Full debug logging in console

### Stopping the Server

```bash
# Terminal 1: Ctrl+C
# This stops Node.js server

# Database persists in ./users.db
```

---

## Option 3: Cloud Deployment

### Heroku (Free Tier Available)

```bash
# Install Heroku CLI
npm install -g heroku

# Login
heroku login

# Create app
heroku create your-app-name

# Deploy
git push heroku main

# Monitor
heroku logs --tail
```

**Note:** Heroku free tier sleeps after 30 mins inactivity. Use paid tier for production.

### AWS ECS (Recommended for Production)

```bash
# Create ECR repository
aws ecr create-repository --repository-name z-beta --region us-east-1

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin YOUR_ECR_URI

# Build and push
docker build -t z-beta:latest .
docker tag z-beta:latest YOUR_ECR_URI/z-beta:latest
docker push YOUR_ECR_URI/z-beta:latest

# Create ECS task definition and service
# (Use AWS Console or cloudformation)
```

### Google Cloud Run (Simplest Serverless)

```bash
# Install Google Cloud CLI
curl https://sdk.cloud.google.com | bash

# Authenticate
gcloud auth login

# Deploy
gcloud run deploy z-beta \
  --source . \
  --platform managed \
  --region us-central1 \
  --port 3001 \
  --allow-unauthenticated

# Get URL
gcloud run services describe z-beta
```

**Advantages:**
- Auto-scaling
- No server management
- Pay only for usage
- Free tier: 2 million requests/month

### DigitalOcean App Platform

1. Push to GitHub
2. Go to DigitalOcean Console
3. Create → App Platform → GitHub
4. Select repository
5. Auto-deploy on push

**Cost:** Starting at $5/month with database

---

## Environment Variables

### Full Configuration

```bash
# Server
NODE_ENV=production              # or 'development'
PORT=3001                        # Server port
JWT_SECRET=your-secret-key       # Critical: Change in production!
DB_PATH=/app/data/music.db       # Database location

# Navidrome
NAVIDROME_URL=https://music.youtubemusicdownloader.life
NAVIDROME_GUEST_USER=guest
NAVIDROME_GUEST_PASS=guest

# Logging
LOG_LEVEL=info                   # debug, info, warn, error

# CORS
CORS_ORIGIN=*                    # or specific domain
```

### Docker with .env file

Create `.env`:
```env
NODE_ENV=production
JWT_SECRET=super-secret-key-here
```

Update `docker-compose.yml`:
```yaml
env_file:
  - .env
```

---

## Database Management

### SQLite (Default)

**Location:** `./data/music.db` (Docker) or `./users.db` (Manual)

**Backup:**
```bash
# Single file backup
cp users.db users.db.backup

# Or with Docker
docker cp z-beta-player:/app/data/music.db ./backup.db
```

**Restore:**
```bash
cp users.db.backup users.db
docker restart z-beta-player
```

### Migrate to PostgreSQL (Production)

Edit `server.js`:
```javascript
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});
```

---

## 🔒 Security Checklist

- [ ] Change `JWT_SECRET` to random 32-character string
- [ ] Use HTTPS in production (SSL certificate)
- [ ] Enable firewall rules (allow only 443, 80)
- [ ] Set `NODE_ENV=production`
- [ ] Use strong database password
- [ ] Enable backups (daily)
- [ ] Monitor logs for suspicious activity
- [ ] Update dependencies: `npm audit fix`
- [ ] Use environment file (`.env`), don't commit secrets
- [ ] Set rate limiting on auth endpoints

---

## Performance Optimization

### Docker Resource Limits

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### Caching Headers

Add to server.js:
```javascript
app.use(express.static('public', {
  maxAge: '1d',
  etag: false
}));
```

### Search Performance

Limit results in `navidrome-search.js`:
```javascript
.slice(0, 100)  // Max 100 results
```

---

## Monitoring & Logging

### Docker Logs

```bash
# Real-time logs
docker-compose logs -f app

# Last 100 lines
docker-compose logs --tail=100 app

# Grep for errors
docker-compose logs app | grep ERROR
```

### Health Check

```bash
# Basic
curl http://localhost:3001/health

# With details
curl http://localhost:3001/health | jq .
```

### System Metrics

```bash
# CPU/Memory usage
docker stats z-beta-player

# Network connections
docker exec z-beta-player netstat -an | grep LISTEN
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs app

# Common issues:
# - Port 3001 already in use: netstat -an | grep 3001
# - Missing dependencies: npm install in Dockerfile
# - File permissions: sudo chmod 777 data/
```

### Database Errors

```bash
# Reset database
rm -f ./data/music.db
docker-compose down
docker-compose up -d

# Check database
docker exec z-beta-player sqlite3 /app/data/music.db ".tables"
```

### Authentication Not Working

```bash
# Verify backend is running
curl http://localhost:3001/health

# Check JWT_SECRET is set
docker-compose exec app printenv JWT_SECRET

# Clear browser tokens
# F12 → Application → Storage → Clear All
```

### Search Returns No Results

```bash
# Test Navidrome connectivity
curl "https://music.youtubemusicdownloader.life/rest/search3.view?u=guest&p=guest&v=1.16.1&c=Z-BETA&f=json&query=test"

# Check browser console for CORS errors (F12)
```

---

## Scaling for Multiple Users

### Horizontal Scaling (Docker Swarm/Kubernetes)

1. Use persistent database (PostgreSQL)
2. Add load balancer (nginx, HAProxy)
3. Replicate containers: `docker service scale app=3`

### Vertical Scaling

```yaml
# More resources per container
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

---

## Updating the Application

### Docker

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose down
docker-compose up -d --build

# Or zero-downtime update
docker-compose up -d --build --no-deps
```

### Manual

```bash
# Install new dependencies
npm install

# Restart server
# Ctrl+C in terminal
npm start
```

---

## Support

For issues:
1. Check logs: `docker-compose logs app`
2. Review README.md
3. Check GitHub issues
4. Open new issue with:
   - Docker version
   - Error message
   - Steps to reproduce
   - OS (Ubuntu, Windows, macOS)
