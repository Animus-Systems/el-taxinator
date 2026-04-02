FROM node:24-slim AS base

ENV PORT=7331
ENV NODE_ENV=production

# Build stage
FROM base AS builder

WORKDIR /app
RUN corepack enable

COPY package.json yarn.lock ./
RUN NODE_ENV=development yarn install --ignore-engines

COPY . .
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npm run build

# Production stage
FROM base

RUN apt-get update && apt-get install -y \
    ca-certificates \
    ghostscript \
    graphicsmagick \
    libwebp-dev \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/yarn.lock ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/routing.ts ./
COPY --from=builder /app/i18n.ts ./
COPY --from=builder /app/messages ./messages
COPY --from=builder /app/schema.sql ./

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN useradd -m -s /bin/bash taxuser \
    && mkdir -p /app/data \
    && chown -R taxuser:taxuser /app

USER taxuser

EXPOSE 7331

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["yarn", "start"]
