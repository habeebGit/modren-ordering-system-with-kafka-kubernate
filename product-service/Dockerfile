FROM node:18-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy package files (install layer will be invalidated if package.json changes)
COPY package*.json ./

# copy repo-level sequelize config + migrations into the build context so they end up in the image
# this ensures migrations/config are present at /app for runtime migrations
# (changed to paths relative to the build context)
COPY migrations /app/migrations
COPY sequelize-config.js /app/sequelize-config.js

# Install global and production dependencies in one layer
RUN npm install -g sequelize-cli && \
    npm ci --only=production

# Copy source code
COPY . .

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

# Start the application via entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]