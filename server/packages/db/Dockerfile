# syntax=docker/dockerfile:1

FROM oven/bun:1.3.11-alpine AS base

RUN apk add --no-cache bash python3 make g++

WORKDIR /app

FROM base AS deps

COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/

RUN bun install

FROM base AS runner

RUN addgroup -S migrations \
	&& adduser -S migrations -G migrations

WORKDIR /app

ENV RUNNING_IN_DOCKER=true

COPY --from=deps --chown=migrations:migrations /app/node_modules ./node_modules
COPY --from=deps --chown=migrations:migrations /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps --chown=migrations:migrations /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --chown=migrations:migrations package.json bun.lock ./
COPY --chown=migrations:migrations packages/shared/package.json ./packages/shared/
COPY --chown=migrations:migrations packages/db/package.json ./packages/db/
COPY --chown=migrations:migrations packages/shared ./packages/shared
COPY --chown=migrations:migrations packages/db ./packages/db

RUN chmod +x packages/db/*.sh

USER migrations

CMD ["./packages/db/migrate.sh"]
