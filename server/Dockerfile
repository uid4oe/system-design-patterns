FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY server/package.json server/
COPY patterns/circuit-breaker/package.json patterns/circuit-breaker/
COPY patterns/saga/package.json patterns/saga/
COPY patterns/cqrs/package.json patterns/cqrs/
COPY patterns/load-balancer/package.json patterns/load-balancer/
COPY patterns/pub-sub/package.json patterns/pub-sub/
COPY patterns/bulkhead/package.json patterns/bulkhead/
COPY patterns/rate-limiter/package.json patterns/rate-limiter/

RUN npm ci --ignore-scripts

COPY packages/core/ packages/core/
COPY server/ server/
COPY patterns/ patterns/
COPY tsconfig.base.json tsconfig.json ./

FROM node:22-slim

ENV NODE_ENV=production

RUN groupadd --system app && useradd --system --gid app app

WORKDIR /app

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/packages ./packages
COPY --from=build --chown=app:app /app/server ./server
COPY --from=build --chown=app:app /app/patterns ./patterns
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/tsconfig.base.json /app/tsconfig.json ./

USER app

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r => { if (!r.ok) process.exit(1) })"

CMD ["npx", "tsx", "server/src/index.ts"]
