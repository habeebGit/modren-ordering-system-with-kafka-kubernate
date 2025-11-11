FROM node:18-alpine

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Create app directory with proper permissions
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3004/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

EXPOSE 3004

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]