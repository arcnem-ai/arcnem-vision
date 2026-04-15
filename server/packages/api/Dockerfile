# syntax=docker/dockerfile:1

FROM oven/bun:1.3.11-alpine AS deps

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/api/package.json ./packages/api/

RUN bun install

FROM oven/bun:1.3.11-alpine AS runner

RUN apk add --no-cache ca-certificates \
	&& addgroup -S app \
	&& adduser -S app -G app

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --from=deps --chown=app:app /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps --chown=app:app /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps --chown=app:app /app/packages/api/node_modules ./packages/api/node_modules
COPY --chown=app:app package.json bun.lock ./
COPY --chown=app:app packages/shared ./packages/shared
COPY --chown=app:app packages/db ./packages/db
COPY --chown=app:app packages/api ./packages/api

USER app

WORKDIR /app/packages/api

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
