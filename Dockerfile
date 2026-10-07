# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY server server
COPY web web
RUN npm run build -w server && npm run build -w web

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production TZ=Europe/Belgrade
RUN apk add --no-cache tzdata
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace server --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY server/migrations server/migrations
COPY server/assets server/assets
COPY server/content server/content
COPY --from=build /app/web/dist web/dist
# link-preview images kept between restarts (a volume in docker-compose.yml)
RUN mkdir -p /app/cache/og && chown -R node:node /app/cache
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server/dist/index.js"]
