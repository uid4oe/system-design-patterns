FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages/ packages/
COPY server/ server/
COPY patterns/ patterns/
RUN npm ci --ignore-scripts

FROM node:22-slim
ENV NODE_ENV=production
RUN groupadd --system app && useradd --system --gid app app
WORKDIR /app
COPY --from=build --chown=app:app /app ./
USER app
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r => { if (!r.ok) process.exit(1) })"
CMD ["npx", "tsx", "server/src/index.ts"]
