# syntax=docker/dockerfile:1

FROM golang:1.26.5-alpine AS builder

RUN apk add --no-cache ca-certificates git

WORKDIR /app

COPY go.work go.work.sum ./
COPY shared/go.mod shared/go.sum ./shared/
COPY db/go.mod db/go.sum ./db/
COPY agents/go.mod agents/go.sum ./agents/
COPY mcp/go.mod mcp/go.sum ./mcp/

WORKDIR /app/agents

RUN go mod download

WORKDIR /app

COPY shared ./shared
COPY db ./db
COPY agents ./agents
COPY mcp ./mcp

WORKDIR /app/agents

RUN CGO_ENABLED=0 GOOS=linux go build -o /out/agents .

FROM alpine:3.23 AS runner

RUN apk add --no-cache ca-certificates \
	&& addgroup -S app \
	&& adduser -S app -G app

WORKDIR /app

ENV GIN_MODE=release
ENV ENVIRONMENT=production

COPY --from=builder /out/agents ./agents

USER app

EXPOSE 3020

CMD ["./agents"]
