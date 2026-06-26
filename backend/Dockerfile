# Gopiram Saree backend — production container for Railway.
# Node 22 (required for the built-in node:sqlite module) + Litestream for
# continuous SQLite backup to Cloudflare R2.

FROM node:22-slim

# Install CA certificates (needed for Litestream to verify Cloudflare R2's TLS)
# and Litestream itself (SQLite replication tool).
ADD https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.deb /tmp/litestream.deb
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && apt-get install -y /tmp/litestream.deb \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/* /tmp/litestream.deb

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy the rest of the backend
COPY . .

# Litestream reads its config from /etc/litestream.yml by default
COPY litestream.yml /etc/litestream.yml

# Persistent data (database + uploads) lives on a mounted volume at /data
ENV DB_PATH=/data/gopiram.db
ENV UPLOADS_DIR=/data/uploads
ENV SERVE_HTTP=true

EXPOSE 3000

# Entry script: restore-from-backup if needed, then run the app under Litestream
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
CMD ["/docker-entrypoint.sh"]
