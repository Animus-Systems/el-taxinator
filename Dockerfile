FROM node:24-slim AS base

# Default environment variables
ENV PORT=7331
ENV NODE_ENV=production

# Build stage
FROM base AS builder

# Install dependencies required for Prisma
RUN apt-get update && apt-get install -y openssl

WORKDIR /app

# Enable Yarn via Corepack
RUN corepack enable

# Copy package files
COPY package.json yarn.lock ./
COPY prisma ./prisma/

# Install all dependencies (including dev for build)
RUN NODE_ENV=development yarn install

# Copy source code
COPY . .

# Build the application (dummy DATABASE_URL for Next.js prerender)
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npm run build

# Production stage
FROM base

# Install required system dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    ghostscript \
    graphicsmagick \
    openssl \
    libwebp-dev \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code@latest @openai/codex@latest

RUN corepack enable

WORKDIR /app

# Create upload directory and set permissions
RUN mkdir -p /app/upload

# Copy built assets from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/yarn.lock ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/prisma.config.ts ./

# Copy and set up entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create non-root user and directories
RUN useradd -m -s /bin/bash taxuser \
    && mkdir -p /app/data \
    && chown -R taxuser:taxuser /app

USER taxuser

EXPOSE 7331

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["yarn", "start"]
