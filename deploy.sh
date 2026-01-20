#!/bin/bash
# Production Deployment Script

set -e

echo "======================================"
echo "Z-Player Production Deployment"
echo "======================================"

# 1. Check prerequisites
echo "[1/6] Checking prerequisites..."
command -v docker >/dev/null 2>&1 || { echo "❌ Docker not found"; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "❌ Docker Compose not found"; exit 1; }
echo "✅ Docker: $(docker --version)"
echo "✅ Docker Compose: $(docker-compose --version)"

# 2. Validate .env file
echo "[2/6] Validating configuration..."
if [ ! -f .env.production ]; then
    echo "❌ .env.production not found"
    exit 1
fi

# Check critical variables
if ! grep -q "JWT_SECRET=" .env.production || [ $(grep "JWT_SECRET=" .env.production | cut -d= -f2 | wc -c) -lt 33 ]; then
    echo "❌ JWT_SECRET not set or too short (min 32 chars)"
    exit 1
fi

if ! grep -q "TUNNEL_TOKEN=" .env.production; then
    echo "❌ TUNNEL_TOKEN not set"
    exit 1
fi
echo "✅ Configuration valid"

# 3. Create data directory
echo "[3/6] Creating data directory..."
mkdir -p data
chmod 700 data
echo "✅ Data directory ready"

# 4. Build images
echo "[4/6] Building Docker images..."
export $(cat .env.production | grep -v '^#' | xargs)
docker-compose build --no-cache
echo "✅ Images built"

# 5. Start services
echo "[5/6] Starting services..."
docker-compose up -d
echo "✅ Services started"

# 6. Verify health
echo "[6/6] Verifying health..."
sleep 5

if docker-compose ps | grep -q "z-player-backend.*healthy"; then
    echo "✅ Backend healthy"
else
    echo "⚠️  Backend checking health..."
fi

if docker-compose ps | grep -q "z-player-nginx.*healthy"; then
    echo "✅ Nginx healthy"
else
    echo "⚠️  Nginx checking health..."
fi

if docker-compose ps | grep -q "z-player-cloudflared.*Up"; then
    echo "✅ Cloudflared running"
else
    echo "⚠️  Cloudflared checking..."
fi

echo ""
echo "======================================"
echo "✅ Deployment Complete!"
echo "======================================"
echo ""
echo "Service Status:"
docker-compose ps
echo ""
echo "Access:"
echo "  - Local:  http://127.0.0.1:8080"
echo "  - Public: https://player.youtubemusicdownloader.life"
echo ""
echo "Logs:"
echo "  docker-compose logs -f"
echo ""
