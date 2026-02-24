FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (compile native modules), then drop build deps
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm install \
    && npm cache clean --force \
    && apk del .build-deps

# Copy app source and static files
COPY src/ ./src/
COPY index.html .
COPY css/ ./css/
COPY assets/ ./assets/
COPY manifest.json sw.js offline.html favicon.png ./

# Create volume mount point for database
RUN mkdir -p /app/data

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start the server from TypeScript source
CMD ["npx", "tsx", "src/server.ts"]
