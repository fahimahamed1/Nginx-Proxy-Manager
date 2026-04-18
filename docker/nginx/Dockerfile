# Build frontend assets
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/ .
RUN npm run build

# Nginx runtime image
FROM nginx:1.27-alpine

LABEL maintainer="Nginx Proxy Manager Modern"
LABEL description="Nginx reverse proxy with modern admin UI"

# Install runtime dependencies
RUN apk add --no-cache \
    openssl \
    logrotate \
    curl \
    jq \
    inotify-tools \
    nginx-mod-stream

# Create runtime directories
RUN mkdir -p /data/nginx/{proxy_host,redirection_host,dead_host,stream,custom,default_host,default_www,temp} \
    /data/letsencrypt-acme-challenge \
    /data/access \
    /data/custom_ssl \
    /data/logs \
    /data/keys \
    /run/nginx \
    /tmp/nginx/body \
    /var/lib/nginx/cache/{public,private} \
    /var/cache/nginx/proxy_temp \
    /var/log/nginx

# Copy frontend build output
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Copy nginx configuration files
COPY docker/nginx/conf/ /etc/nginx/conf.d/custom-origin/
COPY docker/nginx/conf/include/ /etc/nginx/conf.d/include/
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/mime.types /etc/nginx/mime.types
COPY docker/nginx/letsencrypt.ini /etc/letsencrypt.ini

# Copy entrypoint and healthcheck scripts
COPY docker/nginx/entrypoint.sh /docker-entrypoint.d/99-npm-setup.sh
COPY docker/nginx/healthcheck.sh /usr/bin/check-health
RUN chmod +x /docker-entrypoint.d/99-npm-setup.sh /usr/bin/check-health

# Copy logrotate config
COPY docker/nginx/logrotate.conf /etc/logrotate.d/nginx-proxy-manager

# Copy default index page
COPY docker/nginx/default-index.html /etc/nginx/default-index.html

# Copy version file (used by entrypoint to inject version into HTML)
COPY .version /app/.version

# Generate dummy SSL certificate
RUN openssl ecparam -genkey -name prime256v1 -noout -out /data/nginx/dummykey.pem && \
    openssl req -new -days 365 -nodes -x509 \
    -key /data/nginx/dummykey.pem \
    -subj "/O=NPM/OU=Dummy/CN=localhost" \
    -out /data/nginx/dummycert.pem

# Remove default nginx configs
RUN rm -f /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/stream.conf

ENV TZ=UTC

EXPOSE 80 81 443
