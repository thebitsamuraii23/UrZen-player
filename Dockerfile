FROM node:18-alpine

WORKDIR /app

# Install SQLite dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

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
