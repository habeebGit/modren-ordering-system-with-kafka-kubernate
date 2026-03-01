FROM node:18-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy only the order-service package.json first so we can install after the final copy
COPY order-service/package*.json ./

# copy repo-level config + migrations so sequelize-cli can find them at /app
COPY ./sequelize-config.js ./sequelize-config.js
COPY ./migrations ./migrations

# Copy repository files (this may include other package.json files)
COPY . .

# Ensure the order-service package.json is the one used (re-copy to overwrite any root package.json)
COPY order-service/package*.json ./

# Install production deps after final package.json is present
RUN npm ci --only=production

# Install runtime CLI/tools needed for migrations at image build time
# (so the entrypoint can run migrations reliably)
RUN npm install --no-save sequelize-cli sequelize pg pg-hstore

# Copy entrypoint script from order-service directory (source inside build context)
COPY order-service/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port and start service
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "order-service/index.js"]