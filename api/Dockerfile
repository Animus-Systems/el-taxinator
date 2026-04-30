FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY api/package.json api/yarn.lock* ./
RUN yarn install --frozen-lockfile
COPY api/tsconfig.json ./
COPY api/src ./src
RUN yarn build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
RUN corepack enable
COPY api/package.json api/yarn.lock* ./
RUN yarn install --frozen-lockfile --production
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/index.js"]
