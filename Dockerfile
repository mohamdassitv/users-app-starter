# Multi-stage build for the lab application (formerly under lab/)
FROM node:20-alpine AS base
WORKDIR /app

# Copy only dependency manifests first for better layer caching
COPY lab/package*.json ./

# Install only production deps
RUN npm install --omit=dev && npm cache clean --force

# Copy application source
COPY lab/src ./src
# Keep a copy of initial state for seeding named volume on first run
COPY lab/state /seed-state
RUN mkdir -p /app/state && cp -R /seed-state/* /app/state/ || true
COPY lab/logs ./logs

# Environment configuration
ENV PORT=8081 \
    NODE_ENV=production

EXPOSE 8081

# Healthcheck (simple curl via busybox wget)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8081/health || exit 1

COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

CMD ["./entrypoint.sh"]
