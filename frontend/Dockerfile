FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY index.html css js assets ./

RUN npm run build 2>/dev/null || true

# Production stage
FROM nginx:alpine

RUN rm -rf /etc/nginx/conf.d/*

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://localhost:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
