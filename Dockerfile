# Stage 1: Build frontend
FROM node:18-alpine as frontend-build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy frontend files
COPY index.html .
COPY css/ ./css/
COPY js/ ./js/
COPY assets/ ./assets/

# Stage 2: Build backend
FROM node:18-alpine

WORKDIR /app

# Install SQLite dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy backend files
COPY server.js .

# Copy frontend from build stage
COPY --from=frontend-build /app/index.html .
COPY --from=frontend-build /app/css/ ./css/
COPY --from=frontend-build /app/js/ ./js/
COPY --from=frontend-build /app/assets/ ./assets/

# Create volume mount point for database
RUN mkdir -p /app/data

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start the server
CMD ["node", "server.js"]
