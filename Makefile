DOCKER ?= docker
DOCKER_COMPOSE ?= docker compose
PROJECT_NAME := arcnem-vision
SMOKE_WAIT_SECONDS ?= 5
HOST_GATEWAY_ARG := --add-host host.docker.internal:host-gateway
LOCAL_DOCKER_ARGS := $(HOST_GATEWAY_ARG)
POSTGRES_HOST_PORT ?= 5480
REDIS_HOST_PORT ?= 6381
MINIO_API_HOST_PORT ?= 9000
MINIO_CONSOLE_HOST_PORT ?= 9001

SERVICES := api dashboard agents mcp
INFRA_SERVICES := postgres redis minio minio-init
INNGEST_LOG_FILE := .make/inngest.log
INNGEST_TMUX_SESSION := $(PROJECT_NAME)-inngest
INNGEST_DEV_URL := http://localhost:3020/api/inngest
INNGEST_PORT ?= 8288
INNGEST_HEALTH_URL := http://localhost:$(INNGEST_PORT)/health

API_IMAGE := $(PROJECT_NAME)-api
API_CONTAINER := $(PROJECT_NAME)-api
API_TEST_CONTAINER := $(PROJECT_NAME)-api-smoke
API_DOCKERFILE := server/packages/api/Dockerfile
API_CONTEXT := server
API_ENV_FILE := server/packages/api/.env.docker
API_ENV_EXAMPLE_FILE := server/packages/api/.env.docker.example
API_TEST_ENV_FILE := $(API_ENV_FILE)
API_PORT := 3000
API_CONTAINER_PORT := 3000
API_TEST_PORT := 13000
API_TEST_URL := http://localhost:13000/health

DASHBOARD_IMAGE := $(PROJECT_NAME)-dashboard
DASHBOARD_CONTAINER := $(PROJECT_NAME)-dashboard
DASHBOARD_TEST_CONTAINER := $(PROJECT_NAME)-dashboard-smoke
DASHBOARD_DOCKERFILE := server/packages/dashboard/Dockerfile
DASHBOARD_CONTEXT := server
DASHBOARD_ENV_FILE := server/packages/dashboard/.env.docker
DASHBOARD_ENV_EXAMPLE_FILE := server/packages/dashboard/.env.docker.example
DASHBOARD_TEST_ENV_FILE := $(DASHBOARD_ENV_FILE)
DASHBOARD_BUILD_ENV_FILE := $(DASHBOARD_ENV_FILE)
DASHBOARD_BUILD_ARG_VARS := VITE_API_URL
DASHBOARD_PORT := 3001
DASHBOARD_CONTAINER_PORT := 3001
DASHBOARD_TEST_PORT := 13001
DASHBOARD_TEST_URL := http://localhost:13001/

AGENTS_IMAGE := $(PROJECT_NAME)-agents
AGENTS_CONTAINER := $(PROJECT_NAME)-agents
AGENTS_TEST_CONTAINER := $(PROJECT_NAME)-agents-smoke
AGENTS_DOCKERFILE := models/agents/Dockerfile
AGENTS_CONTEXT := models
AGENTS_ENV_FILE := models/agents/.env.docker
AGENTS_ENV_EXAMPLE_FILE := models/agents/.env.docker.example
AGENTS_TEST_ENV_FILE := $(AGENTS_ENV_FILE)
AGENTS_PORT := 3020
AGENTS_CONTAINER_PORT := 3020
AGENTS_TEST_PORT := 13020
AGENTS_TEST_URL := http://localhost:13020/health

MCP_IMAGE := $(PROJECT_NAME)-mcp
MCP_CONTAINER := $(PROJECT_NAME)-mcp
MCP_TEST_CONTAINER := $(PROJECT_NAME)-mcp-smoke
MCP_DOCKERFILE := models/mcp/Dockerfile
MCP_CONTEXT := models
MCP_ENV_FILE := models/mcp/.env.docker
MCP_ENV_EXAMPLE_FILE := models/mcp/.env.docker.example
MCP_TEST_ENV_FILE := $(MCP_ENV_FILE)
MCP_PORT := 3021
MCP_CONTAINER_PORT := 3021
MCP_TEST_PORT := 13021
MCP_TEST_URL := http://localhost:13021/health

DB_IMAGE := $(PROJECT_NAME)-db
DB_CONTAINER := $(PROJECT_NAME)-db
DB_DOCKERFILE := server/packages/db/Dockerfile
DB_CONTEXT := server
DB_ENV_FILE := server/packages/db/.env.docker
DB_ENV_EXAMPLE_FILE := server/packages/db/.env.docker.example
DB_MIGRATIONS_DIR := $(CURDIR)/server/packages/db/src/migrations
DB_DOCKER_ARGS ?=
API_S3_BUCKET := $(strip $(shell [ -f "$(API_ENV_FILE)" ] && awk -F= '/^S3_BUCKET=/{print $$2; exit}' "$(API_ENV_FILE)"))

LIVE_SERVICE_STACK_NAME := $(PROJECT_NAME)-live-service
LIVE_SERVICE_POSTGRES_HOST_PORT := 15480
LIVE_SERVICE_REDIS_HOST_PORT := 16381
LIVE_SERVICE_MINIO_API_HOST_PORT := 19000
LIVE_SERVICE_MINIO_CONSOLE_HOST_PORT := 19001
LIVE_SERVICE_API_PORT := $(API_TEST_PORT)
LIVE_SERVICE_AGENTS_PORT := $(AGENTS_TEST_PORT)
LIVE_SERVICE_MCP_PORT := $(MCP_TEST_PORT)
LIVE_SERVICE_INNGEST_PORT := 18288
LIVE_SERVICE_API_CONTAINER := $(PROJECT_NAME)-api-live-service
LIVE_SERVICE_AGENTS_CONTAINER := $(PROJECT_NAME)-agents-live-service
LIVE_SERVICE_MCP_CONTAINER := $(PROJECT_NAME)-mcp-live-service
LIVE_SERVICE_DB_URL_HOST := postgres://postgres:postgres@localhost:$(LIVE_SERVICE_POSTGRES_HOST_PORT)/postgres
LIVE_SERVICE_DB_URL_CONTAINER := postgres://postgres:postgres@host.docker.internal:$(LIVE_SERVICE_POSTGRES_HOST_PORT)/postgres
LIVE_SERVICE_REDIS_URL_CONTAINER := redis://host.docker.internal:$(LIVE_SERVICE_REDIS_HOST_PORT)
LIVE_SERVICE_S3_ENDPOINT_CONTAINER := http://host.docker.internal:$(LIVE_SERVICE_MINIO_API_HOST_PORT)
LIVE_SERVICE_S3_BUCKET := $(if $(API_S3_BUCKET),$(API_S3_BUCKET),arcnem-vision)
LIVE_SERVICE_S3_PUBLIC_BASE_URL_HOST := http://localhost:$(LIVE_SERVICE_MINIO_API_HOST_PORT)/$(LIVE_SERVICE_S3_BUCKET)
LIVE_SERVICE_S3_PUBLIC_BASE_URL_CONTAINER := http://host.docker.internal:$(LIVE_SERVICE_MINIO_API_HOST_PORT)/$(LIVE_SERVICE_S3_BUCKET)
LIVE_SERVICE_API_KEY := seed_srv_J5m8Q2r6S9t3U7v1W4x8Y2z6A9b3C7d1E4f8G2h6J9k3L7m1P4
LIVE_SERVICE_WORKFLOW_NAME := Document Processing Pipeline
LIVE_SERVICE_API_BASE_URL_HOST := http://localhost:$(LIVE_SERVICE_API_PORT)
LIVE_SERVICE_API_BASE_URL_CONTAINER := http://host.docker.internal:$(LIVE_SERVICE_API_PORT)
LIVE_SERVICE_API_URL := $(LIVE_SERVICE_API_BASE_URL_HOST)/api
LIVE_SERVICE_AGENTS_URL := http://localhost:$(LIVE_SERVICE_AGENTS_PORT)/health
LIVE_SERVICE_MCP_URL := http://localhost:$(LIVE_SERVICE_MCP_PORT)/health
LIVE_SERVICE_INNGEST_DEV_URL := http://localhost:$(LIVE_SERVICE_AGENTS_PORT)/api/inngest
LIVE_SERVICE_INNGEST_BASE_URL_CONTAINER := http://host.docker.internal:$(LIVE_SERVICE_INNGEST_PORT)
LIVE_SERVICE_INNGEST_HEALTH_URL := http://localhost:$(LIVE_SERVICE_INNGEST_PORT)/health
LIVE_SERVICE_INNGEST_LOG_FILE := .make/live-service-test/inngest.log
LIVE_SERVICE_INNGEST_TMUX_SESSION := $(PROJECT_NAME)-live-service-inngest
LIVE_SERVICE_MCP_SERVER_URL_CONTAINER := http://host.docker.internal:$(LIVE_SERVICE_MCP_PORT)
LIVE_SERVICE_DOCKER_COMPOSE = env POSTGRES_HOST_PORT=$(LIVE_SERVICE_POSTGRES_HOST_PORT) REDIS_HOST_PORT=$(LIVE_SERVICE_REDIS_HOST_PORT) MINIO_API_HOST_PORT=$(LIVE_SERVICE_MINIO_API_HOST_PORT) MINIO_CONSOLE_HOST_PORT=$(LIVE_SERVICE_MINIO_CONSOLE_HOST_PORT) $(DOCKER_COMPOSE) -p $(LIVE_SERVICE_STACK_NAME)
LIVE_SERVICE_DB_DOCKER_ARGS := --env DATABASE_URL=$(LIVE_SERVICE_DB_URL_CONTAINER) --env S3_ENDPOINT=$(LIVE_SERVICE_S3_ENDPOINT_CONTAINER)
LIVE_SERVICE_API_DOCKER_ARGS := --env BETTER_AUTH_BASE_URL=$(LIVE_SERVICE_API_BASE_URL_CONTAINER) --env DATABASE_URL=$(LIVE_SERVICE_DB_URL_CONTAINER) --env REDIS_URL=$(LIVE_SERVICE_REDIS_URL_CONTAINER) --env S3_ENDPOINT=$(LIVE_SERVICE_S3_ENDPOINT_CONTAINER) --env S3_PUBLIC_BASE_URL=$(LIVE_SERVICE_S3_PUBLIC_BASE_URL_CONTAINER) --env MCP_SERVER_URL=$(LIVE_SERVICE_MCP_SERVER_URL_CONTAINER) --env INNGEST_DEV=$(LIVE_SERVICE_INNGEST_BASE_URL_CONTAINER)
LIVE_SERVICE_AGENTS_DOCKER_ARGS := --env DATABASE_URL=$(LIVE_SERVICE_DB_URL_CONTAINER) --env REDIS_URL=$(LIVE_SERVICE_REDIS_URL_CONTAINER) --env S3_ENDPOINT=$(LIVE_SERVICE_S3_ENDPOINT_CONTAINER) --env MCP_SERVER_URL=$(LIVE_SERVICE_MCP_SERVER_URL_CONTAINER) --env INNGEST_DEV=$(LIVE_SERVICE_INNGEST_BASE_URL_CONTAINER)
LIVE_SERVICE_MCP_DOCKER_ARGS := --env DATABASE_URL=$(LIVE_SERVICE_DB_URL_CONTAINER) --env REDIS_URL=$(LIVE_SERVICE_REDIS_URL_CONTAINER) --env S3_ENDPOINT=$(LIVE_SERVICE_S3_ENDPOINT_CONTAINER)

.PHONY: help infra-up infra-down live-service-infra-up live-service-infra-down wait-live-service-infra run-inngest stop-inngest logs-inngest verify-stack verify-service-test-stack build-all test-all run-all stop-all clean-all build-db migrate-db seed-db generate-db clean-db live-service-stack-up live-service-stack-down live-service-test $(SERVICES:%=build-%) $(SERVICES:%=test-%) $(SERVICES:%=run-%) $(SERVICES:%=stop-%) $(SERVICES:%=logs-%) $(SERVICES:%=clean-%)

help:
	@echo "Docker targets"
	@echo ""
	@echo "Local docker runs and smoke tests read each service's existing .env.docker file."
	@echo "If you have not created them yet, seed them from the committed .env.docker.example files."
	@echo "make live-service-test reuses those same env files, but overrides infra endpoints at runtime"
	@echo "so the live probe runs against an isolated stack instead of your normal dev data."
	@echo ""
	@echo "Per service:"
	@echo "  make build-{api|dashboard|agents|mcp}"
	@echo "  make test-{api|dashboard|agents|mcp}"
	@echo "  make run-{api|dashboard|agents|mcp}"
	@echo "  make stop-{api|dashboard|agents|mcp}"
	@echo "  make logs-{api|dashboard|agents|mcp}"
	@echo "  make clean-{api|dashboard|agents|mcp}"
	@echo ""
	@echo "Database:"
	@echo "  make build-db"
	@echo "  make migrate-db"
	@echo "  make seed-db"
	@echo "  make generate-db"
	@echo "  make clean-db"
	@echo ""
	@echo "Infrastructure:"
	@echo "  make infra-up"
	@echo "  make infra-down"
	@echo "  make live-service-infra-up"
	@echo "  make live-service-infra-down"
	@echo "  make run-inngest"
	@echo "  make stop-inngest"
	@echo "  make logs-inngest"
	@echo "  make verify-stack"
	@echo ""
	@echo "Bulk:"
	@echo "  make build-all"
	@echo "  make test-all"
	@echo "  make live-service-stack-up"
	@echo "  make live-service-stack-down"
	@echo "  make live-service-test"
	@echo "  make run-all"
	@echo "  make stop-all"
	@echo "  make clean-all"

define DOCKER_SERVICE_TARGETS
build-$(1):
	@set -a; \
	if [ -n "$($(2)_BUILD_ENV_FILE)" ]; then \
		if [ ! -f "$($(2)_BUILD_ENV_FILE)" ]; then \
			echo "Missing env file: $($(2)_BUILD_ENV_FILE) (copy $($(2)_ENV_EXAMPLE_FILE))"; \
			exit 1; \
		fi; \
		. "$($(2)_BUILD_ENV_FILE)"; \
	fi; \
	$(DOCKER) build \
		$(foreach var,$($(2)_BUILD_ARG_VARS),--build-arg $(var)) \
		-t $($(2)_IMAGE):latest \
		-f $($(2)_DOCKERFILE) \
		$($(2)_CONTEXT)

test-$(1): build-$(1)
	@if [ ! -f "$($(2)_TEST_ENV_FILE)" ]; then \
		echo "Missing env file: $($(2)_TEST_ENV_FILE) (copy $($(2)_ENV_EXAMPLE_FILE))"; \
		exit 1; \
	fi
	@set -e; \
	trap '$(DOCKER) rm -f $($(2)_TEST_CONTAINER) >/dev/null 2>&1 || true' EXIT; \
	$(DOCKER) rm -f $($(2)_TEST_CONTAINER) >/dev/null 2>&1 || true; \
	$(DOCKER) run -d \
		--name $($(2)_TEST_CONTAINER) \
		-p $($(2)_TEST_PORT):$($(2)_CONTAINER_PORT) \
		--env-file $($(2)_TEST_ENV_FILE) \
		$(LOCAL_DOCKER_ARGS) \
		$($(2)_TEST_DOCKER_ARGS) \
		$($(2)_IMAGE):latest >/dev/null; \
	sleep $(SMOKE_WAIT_SECONDS); \
	if [ "$$$$($(DOCKER) inspect -f '{{.State.Running}}' $($(2)_TEST_CONTAINER) 2>/dev/null)" != "true" ]; then \
		$(DOCKER) logs $($(2)_TEST_CONTAINER); \
		exit 1; \
	fi; \
	if [ -n "$($(2)_TEST_URL)" ]; then \
		curl --fail --silent --show-error "$($(2)_TEST_URL)" >/dev/null; \
	fi; \
	echo "Smoke test passed: $(1)"

run-$(1): build-$(1)
	@if [ ! -f "$($(2)_ENV_FILE)" ]; then \
		echo "Missing env file: $($(2)_ENV_FILE) (copy $($(2)_ENV_EXAMPLE_FILE))"; \
		exit 1; \
	fi
	@$(DOCKER) rm -f $($(2)_CONTAINER) >/dev/null 2>&1 || true
	$(DOCKER) run -d \
		--name $($(2)_CONTAINER) \
		-p $($(2)_PORT):$($(2)_CONTAINER_PORT) \
		--env-file $($(2)_ENV_FILE) \
		$(LOCAL_DOCKER_ARGS) \
		$($(2)_RUN_DOCKER_ARGS) \
		$($(2)_IMAGE):latest

stop-$(1):
	@$(DOCKER) rm -f $($(2)_CONTAINER) >/dev/null 2>&1 || true

logs-$(1):
	$(DOCKER) logs -f $($(2)_CONTAINER)

clean-$(1): stop-$(1)
	@$(DOCKER) rm -f $($(2)_TEST_CONTAINER) >/dev/null 2>&1 || true
	@$(DOCKER) rmi $($(2)_IMAGE):latest >/dev/null 2>&1 || true
endef

$(eval $(call DOCKER_SERVICE_TARGETS,api,API))
$(eval $(call DOCKER_SERVICE_TARGETS,dashboard,DASHBOARD))
$(eval $(call DOCKER_SERVICE_TARGETS,agents,AGENTS))
$(eval $(call DOCKER_SERVICE_TARGETS,mcp,MCP))

build-db:
	$(DOCKER) build -t $(DB_IMAGE):latest -f $(DB_DOCKERFILE) $(DB_CONTEXT)

migrate-db: build-db
	@if [ ! -f "$(DB_ENV_FILE)" ]; then \
		echo "Missing env file: $(DB_ENV_FILE) (copy $(DB_ENV_EXAMPLE_FILE))"; \
		exit 1; \
	fi
	$(DOCKER) run --rm \
		--name $(DB_CONTAINER) \
		--env-file $(DB_ENV_FILE) \
		$(LOCAL_DOCKER_ARGS) \
		$(DB_DOCKER_ARGS) \
		$(DB_IMAGE):latest

seed-db: build-db
	@if [ ! -f "$(DB_ENV_FILE)" ]; then \
		echo "Missing env file: $(DB_ENV_FILE) (copy $(DB_ENV_EXAMPLE_FILE))"; \
		exit 1; \
	fi
	$(DOCKER) run --rm \
		--name $(DB_CONTAINER) \
		--env-file $(DB_ENV_FILE) \
		$(LOCAL_DOCKER_ARGS) \
		$(DB_DOCKER_ARGS) \
		$(DB_IMAGE):latest \
		bun run --cwd packages/db db:seed

generate-db: build-db
	@if [ ! -f "$(DB_ENV_FILE)" ]; then \
		echo "Missing env file: $(DB_ENV_FILE) (copy $(DB_ENV_EXAMPLE_FILE))"; \
		exit 1; \
	fi
	$(DOCKER) run --rm \
		--name $(DB_CONTAINER) \
		-v "$(DB_MIGRATIONS_DIR):/app/packages/db/src/migrations" \
		--env-file $(DB_ENV_FILE) \
		$(LOCAL_DOCKER_ARGS) \
		$(DB_DOCKER_ARGS) \
		$(DB_IMAGE):latest \
		./packages/db/generate.sh

clean-db:
	@$(DOCKER) rm -f $(DB_CONTAINER) >/dev/null 2>&1 || true
	@$(DOCKER) rmi $(DB_IMAGE):latest >/dev/null 2>&1 || true

infra-up:
	$(DOCKER_COMPOSE) up -d $(INFRA_SERVICES)

infra-down:
	@$(DOCKER_COMPOSE) rm -sf $(INFRA_SERVICES) >/dev/null 2>&1 || true

live-service-infra-up:
	$(LIVE_SERVICE_DOCKER_COMPOSE) up -d $(INFRA_SERVICES)

live-service-infra-down:
	@$(LIVE_SERVICE_DOCKER_COMPOSE) down -v --remove-orphans >/dev/null 2>&1 || true

wait-live-service-infra:
	@set -e; \
	for service in postgres redis minio; do \
		container_id="$$($(LIVE_SERVICE_DOCKER_COMPOSE) ps -q $$service)"; \
		if [ -z "$$container_id" ]; then \
			echo "Missing live-service infra container: $$service"; \
			exit 1; \
		fi; \
		ready=""; \
		for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do \
			ready="$$( $(DOCKER) inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $$container_id 2>/dev/null )"; \
			if [ "$$ready" = "healthy" ] || [ "$$ready" = "running" ]; then \
				break; \
			fi; \
			sleep 2; \
		done; \
		if [ "$$ready" != "healthy" ] && [ "$$ready" != "running" ]; then \
			echo "$$service did not become ready (status=$$ready)"; \
			exit 1; \
		fi; \
	done; \
	init_container_id="$$($(LIVE_SERVICE_DOCKER_COMPOSE) ps -q minio-init)"; \
	if [ -n "$$init_container_id" ]; then \
		init_status=""; \
		for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do \
			init_status="$$( $(DOCKER) inspect -f '{{.State.Status}}' $$init_container_id 2>/dev/null )"; \
			init_exit_code="$$( $(DOCKER) inspect -f '{{.State.ExitCode}}' $$init_container_id 2>/dev/null )"; \
			if [ "$$init_status" = "exited" ] && [ "$$init_exit_code" = "0" ]; then \
				break; \
			fi; \
			sleep 2; \
		done; \
		if [ "$$init_status" != "exited" ] || [ "$$init_exit_code" != "0" ]; then \
			echo "minio-init did not complete successfully"; \
			exit 1; \
		fi; \
	fi; \
	echo "Live-service infra ready"

run-inngest:
	@mkdir -p "$(dir $(INNGEST_LOG_FILE))"
	@if ! command -v tmux >/dev/null 2>&1; then \
		echo "tmux is required to run Inngest in the background"; \
		exit 1; \
	fi
	@if tmux has-session -t "$(INNGEST_TMUX_SESSION)" 2>/dev/null; then \
		echo "Inngest already running in tmux session $(INNGEST_TMUX_SESSION)"; \
		exit 0; \
	fi
	@rm -f "$(INNGEST_LOG_FILE)"
	@tmux new-session -d -s "$(INNGEST_TMUX_SESSION)" "cd '$(CURDIR)' && exec npx inngest-cli@latest dev -u '$(INNGEST_DEV_URL)' -p '$(INNGEST_PORT)' >>'$(INNGEST_LOG_FILE)' 2>&1"
	@for attempt in 1 2 3 4 5 6 7 8 9 10; do \
		if curl --fail --silent --show-error "$(INNGEST_HEALTH_URL)" >/dev/null 2>&1; then \
			echo "Inngest running in tmux session $(INNGEST_TMUX_SESSION)"; \
			exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "Inngest failed to start"; \
	cat "$(INNGEST_LOG_FILE)"; \
	tmux kill-session -t "$(INNGEST_TMUX_SESSION)" >/dev/null 2>&1 || true; \
	exit 1

stop-inngest:
	@tmux kill-session -t "$(INNGEST_TMUX_SESSION)" >/dev/null 2>&1 || true

logs-inngest:
	@if [ -f "$(INNGEST_LOG_FILE)" ]; then \
		tail -f "$(INNGEST_LOG_FILE)"; \
	else \
		echo "No Inngest log found at $(INNGEST_LOG_FILE)"; \
	fi

verify-stack:
	@set -e; \
	for url in "http://localhost:3000/health" "http://localhost:3020/health" "http://localhost:3021/health" "$(INNGEST_HEALTH_URL)" "http://localhost:3001/?showArchived=false"; do \
		ready=""; \
		for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do \
			if curl --fail --silent --show-error "$$url" >/dev/null 2>&1; then \
				ready=1; \
				break; \
			fi; \
			sleep 1; \
		done; \
		if [ "$$ready" != "1" ]; then \
			echo "Timed out waiting for $$url"; \
			exit 1; \
		fi; \
	done
	@echo "Stack verification passed"

verify-service-test-stack:
	@set -e; \
	for url in "$(LIVE_SERVICE_API_BASE_URL_HOST)/health" "$(LIVE_SERVICE_AGENTS_URL)" "$(LIVE_SERVICE_MCP_URL)" "$(LIVE_SERVICE_INNGEST_HEALTH_URL)"; do \
		ready=""; \
		for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do \
			if curl --fail --silent --show-error "$$url" >/dev/null 2>&1; then \
				ready=1; \
				break; \
			fi; \
			sleep 1; \
		done; \
		if [ "$$ready" != "1" ]; then \
			echo "Timed out waiting for $$url"; \
			exit 1; \
		fi; \
	done
	@echo "Service test stack verification passed"

build-all: $(SERVICES:%=build-%) build-db

test-all:
	@$(MAKE) infra-up
	@$(MAKE) migrate-db
	@$(MAKE) test-api
	@$(MAKE) test-dashboard
	@$(MAKE) test-agents
	@$(MAKE) test-mcp

live-service-stack-up:
	@$(MAKE) live-service-infra-up
	@$(MAKE) wait-live-service-infra
	@$(MAKE) migrate-db DB_DOCKER_ARGS='$(LIVE_SERVICE_DB_DOCKER_ARGS)'
	@$(MAKE) seed-db DB_DOCKER_ARGS='$(LIVE_SERVICE_DB_DOCKER_ARGS)'
	@$(MAKE) run-mcp MCP_CONTAINER='$(LIVE_SERVICE_MCP_CONTAINER)' MCP_PORT='$(LIVE_SERVICE_MCP_PORT)' MCP_RUN_DOCKER_ARGS='$(LIVE_SERVICE_MCP_DOCKER_ARGS)'
	@$(MAKE) run-agents AGENTS_CONTAINER='$(LIVE_SERVICE_AGENTS_CONTAINER)' AGENTS_PORT='$(LIVE_SERVICE_AGENTS_PORT)' AGENTS_RUN_DOCKER_ARGS='$(LIVE_SERVICE_AGENTS_DOCKER_ARGS)'
	@$(MAKE) run-api API_CONTAINER='$(LIVE_SERVICE_API_CONTAINER)' API_PORT='$(LIVE_SERVICE_API_PORT)' API_RUN_DOCKER_ARGS='$(LIVE_SERVICE_API_DOCKER_ARGS)'
	@$(MAKE) stop-inngest INNGEST_TMUX_SESSION='$(LIVE_SERVICE_INNGEST_TMUX_SESSION)'
	@$(MAKE) run-inngest INNGEST_PORT='$(LIVE_SERVICE_INNGEST_PORT)' INNGEST_LOG_FILE='$(LIVE_SERVICE_INNGEST_LOG_FILE)' INNGEST_TMUX_SESSION='$(LIVE_SERVICE_INNGEST_TMUX_SESSION)' INNGEST_DEV_URL='$(LIVE_SERVICE_INNGEST_DEV_URL)' INNGEST_HEALTH_URL='$(LIVE_SERVICE_INNGEST_HEALTH_URL)'
	@$(MAKE) verify-service-test-stack

live-service-stack-down:
	@$(MAKE) stop-api API_CONTAINER='$(LIVE_SERVICE_API_CONTAINER)'
	@$(MAKE) stop-agents AGENTS_CONTAINER='$(LIVE_SERVICE_AGENTS_CONTAINER)'
	@$(MAKE) stop-mcp MCP_CONTAINER='$(LIVE_SERVICE_MCP_CONTAINER)'
	@$(MAKE) stop-inngest INNGEST_TMUX_SESSION='$(LIVE_SERVICE_INNGEST_TMUX_SESSION)'
	@$(MAKE) live-service-infra-down

live-service-test: live-service-stack-up
	@workflow_id="$$($(DOCKER) run --rm \
		-v "$(CURDIR)/server:/app" \
		-w /app \
		--env DATABASE_URL='$(LIVE_SERVICE_DB_URL_CONTAINER)' \
		$(LOCAL_DOCKER_ARGS) \
		oven/bun:1.3.11 \
		bun -e 'import { getDB } from "./packages/db/src/server"; const db = getDB(); const workflow = await db.query.agentGraphs.findFirst({ where: (row, { eq }) => eq(row.name, "$(LIVE_SERVICE_WORKFLOW_NAME)"), columns: { id: true } }); if (!workflow) { throw new Error("Workflow not found: $(LIVE_SERVICE_WORKFLOW_NAME)"); } console.log(workflow.id);')"; \
	test -n "$$workflow_id"; \
	$(DOCKER) run --rm \
		-v "$(CURDIR)/server:/app" \
		-w /app \
		--env DATABASE_URL='$(LIVE_SERVICE_DB_URL_CONTAINER)' \
		--env SERVICE_API_URL='$(LIVE_SERVICE_API_BASE_URL_CONTAINER)/api' \
		--env SERVICE_API_KEY='$(LIVE_SERVICE_API_KEY)' \
		--env SERVICE_WORKFLOW_ID="$$workflow_id" \
		--env S3_PUBLIC_BASE_URL='$(LIVE_SERVICE_S3_PUBLIC_BASE_URL_CONTAINER)' \
		$(LOCAL_DOCKER_ARGS) \
		oven/bun:1.3.11 \
		bun run test:live:service-api

run-all:
	@$(MAKE) infra-up
	@$(MAKE) migrate-db
	@$(MAKE) run-mcp
	@$(MAKE) run-agents
	@$(MAKE) run-api
	@$(MAKE) run-dashboard
	@$(MAKE) run-inngest
	@$(MAKE) verify-stack

stop-all:
	@$(MAKE) stop-dashboard
	@$(MAKE) stop-api
	@$(MAKE) stop-agents
	@$(MAKE) stop-mcp
	@$(MAKE) stop-inngest
	@$(MAKE) infra-down

clean-all:
	@$(MAKE) stop-all
	@$(MAKE) clean-api
	@$(MAKE) clean-dashboard
	@$(MAKE) clean-agents
	@$(MAKE) clean-mcp
	@$(MAKE) clean-db
