FROM node:18-alpine AS base

WORKDIR /app

# Install deps first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy source
COPY . .

# Default environment
ENV NODE_ENV=production

# Healthcheck (optional lightweight)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "try{require('./package.json');process.exit(0)}catch(e){process.exit(1)}"

# Start the bot
CMD ["node", "index.js"]