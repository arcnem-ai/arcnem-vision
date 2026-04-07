# syntax=docker/dockerfile:1

FROM oven/bun:1.3.11-alpine AS base

RUN apk add --no-cache python3 make g++

WORKDIR /app

FROM base AS deps

COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/dashboard/package.json ./packages/dashboard/

RUN bun install

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/dashboard/node_modules ./packages/dashboard/node_modules
COPY package.json bun.lock ./
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY packages/dashboard ./packages/dashboard

WORKDIR /app/packages/dashboard

ARG API_URL

RUN test -n "$API_URL"
RUN API_URL="$API_URL" bun run build

FROM oven/bun:1.3.11-alpine AS runner

RUN apk add --no-cache ca-certificates \
	&& addgroup -S app \
	&& adduser -S app -G app

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=builder --chown=app:app /app/packages/dashboard/node_modules ./packages/dashboard/node_modules
COPY --chown=app:app package.json bun.lock ./
COPY --chown=app:app packages/dashboard/package.json ./packages/dashboard/
COPY --chown=app:app packages/db ./packages/db
COPY --chown=app:app packages/shared ./packages/shared
COPY --from=builder --chown=app:app /app/packages/dashboard/dist ./packages/dashboard/dist
COPY --from=builder --chown=app:app /app/packages/dashboard/server.prod.ts ./packages/dashboard/server.prod.ts

USER app

WORKDIR /app/packages/dashboard

EXPOSE 3001

CMD ["bun", "run", "server.prod.ts"]
