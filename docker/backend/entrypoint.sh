#!/bin/sh
set -e

# Backend container entrypoint: init directories and seed configs

echo "[backend] Starting initialisation..."

# Create runtime directories
mkdir -p /tmp/nginx/body \
    /data/nginx/default_host \
    /data/nginx/default_www \
    /data/nginx/proxy_host \
    /data/nginx/redirection_host \
    /data/nginx/stream \
    /data/nginx/dead_host \
    /data/nginx/temp \
    /data/nginx/custom \
    /data/access \
    /data/custom_ssl \
    /data/letsencrypt-acme-challenge \
    /data/logs \
    /data/keys

# Seed production/default configs if missing
if [ ! -f /etc/nginx/conf.d/production.conf ]; then
    cp /etc/nginx/conf.d/custom-origin/production.conf /etc/nginx/conf.d/production.conf
    cp /etc/nginx/conf.d/custom-origin/default.conf /etc/nginx/conf.d/default.conf
fi

# Seed default include files
mkdir -p /etc/nginx/conf.d/include
if [ ! -f /etc/nginx/conf.d/include/resolvers.conf ]; then
    echo "resolver 127.0.0.11 valid=30s;" > /etc/nginx/conf.d/include/resolvers.conf
fi
if [ ! -f /etc/nginx/conf.d/include/ip_ranges.conf ]; then
    echo "# IP ranges — auto-generated" > /etc/nginx/conf.d/include/ip_ranges.conf
fi
for f in /etc/nginx/conf.d/custom-origin/include/*.conf; do
    fname=$(basename "$f")
    if [ ! -f "/etc/nginx/conf.d/include/$fname" ]; then
        cp "$f" "/etc/nginx/conf.d/include/$fname"
    fi
done

rm -f /etc/letsencrypt/cli.ini

echo "[backend] Initialisation complete!"

# Start API server
echo "[backend] Starting API server..."
exec node /app/backend/dist/index.js
