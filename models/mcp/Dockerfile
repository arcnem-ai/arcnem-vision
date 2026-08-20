# syntax=docker/dockerfile:1

FROM golang:1.27.0-alpine AS builder

RUN apk add --no-cache ca-certificates git

WORKDIR /app

COPY go.work go.work.sum ./
COPY shared/go.mod shared/go.sum ./shared/
COPY db/go.mod db/go.sum ./db/
COPY agents/go.mod agents/go.sum ./agents/
COPY mcp/go.mod mcp/go.sum ./mcp/

WORKDIR /app/mcp

RUN go mod download

WORKDIR /app

COPY shared ./shared
COPY db ./db
COPY agents ./agents
COPY mcp ./mcp

WORKDIR /app/mcp

RUN CGO_ENABLED=0 GOOS=linux go build -o /out/mcp .

FROM alpine:3.23 AS runner

RUN apk add --no-cache ca-certificates \
	&& addgroup -S app \
	&& adduser -S app -G app

WORKDIR /app

ENV ENVIRONMENT=production

COPY --from=builder /out/mcp ./mcp

USER app

EXPOSE 3021

CMD ["./mcp"]
