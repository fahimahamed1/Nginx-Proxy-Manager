FROM node:22-alpine

LABEL maintainer="Nginx Proxy Manager Modern"
LABEL description="Backend API server for Nginx Proxy Manager"

# Install runtime dependencies
RUN apk add --no-cache \
    nginx \
    certbot \
    openssl \
    && rm -rf /etc/nginx/conf.d/* /var/www/html/*

# Create runtime directories
RUN mkdir -p /data/nginx/{proxy_host,redirection_host,dead_host,stream,custom,default_host,default_www,temp} \
    /data/letsencrypt-acme-challenge \
    /data/access \
    /data/custom_ssl \
    /data/logs \
    /data/keys

# Copy version file (read at runtime by env.ts)
COPY .version /app/.version

# Install backend dependencies
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci

# Build backend
COPY backend/ ./backend/
RUN cd backend && npm run build && cp -r src/templates dist/

# Copy nginx configuration files
COPY docker/nginx/conf/ /etc/nginx/conf.d/custom-origin/
COPY docker/nginx/conf/include/ /etc/nginx/conf.d/include/
COPY docker/nginx/nginx-backend.conf /etc/nginx/nginx.conf
COPY docker/nginx/mime.types /etc/nginx/mime.types

# Copy entrypoint script
COPY docker/backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Prune dev dependencies
RUN cd backend && npm prune --omit=dev && npm cache clean --force

ENV NODE_ENV=production \
    TZ=UTC

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
