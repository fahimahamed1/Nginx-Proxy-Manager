# Nginx Proxy Manager Modern

.PHONY: help \
	docker-up docker-down docker-restart docker-build docker-logs docker-ps \
	docker-nginx-logs docker-backend-logs docker-shell-nginx docker-shell-backend \
	docker-stop docker-rm docker-clean-volumes docker-prune \
	build-frontend build-backend build-all build-docker \
	dev-frontend dev-backend dev-lint dev-format \
	clean clean-all \
	setup

# Configuration
COMPOSE_FILE    := docker/docker-compose.yml
COMPOSE         := docker compose -f $(COMPOSE_FILE)
PROJECT_NAME    := nginx-proxy-manager-modern
FRONTEND_DIR    := frontend
BACKEND_DIR     := backend

# ANSI colours
CYAN   := \033[0;36m
GREEN  := \033[0;32m
YELLOW := \033[1;33m
RED    := \033[0;31m
BOLD   := \033[1m
NC     := \033[0m

# Docker
docker-up: ## Start services
	@echo -e "$(CYAN)$(BOLD)Starting services...$(NC)"
	$(COMPOSE) up -d
	@echo -e "$(GREEN)$(BOLD)Services started.$(NC)"
	@echo -e "  Admin UI  → $(CYAN)http://localhost:81$(NC)"
	@echo -e "  HTTP      → $(CYAN)http://localhost:80$(NC)"
	@echo -e "  HTTPS     → $(CYAN)https://localhost:443$(NC)"

docker-down: ## Stop services
	@echo -e "$(CYAN)$(BOLD)Stopping services...$(NC)"
	$(COMPOSE) down
	@echo -e "$(GREEN)$(BOLD)Services stopped.$(NC)"

docker-restart: docker-down docker-up ## Restart services

docker-build: ## Build Docker images
	@echo -e "$(CYAN)$(BOLD)Building Docker images...$(NC)"
	$(COMPOSE) build
	@echo -e "$(GREEN)$(BOLD)Docker images built.$(NC)"
	@echo -e "  $(CYAN)$(PROJECT_NAME):nginx$(NC)"
	@echo -e "  $(CYAN)$(PROJECT_NAME):backend$(NC)"

docker-up-build: ## Build & start all
	$(COMPOSE) up -d --build

docker-logs: ## Follow all logs
	$(COMPOSE) logs -f

docker-nginx-logs: ## Follow nginx logs
	$(COMPOSE) logs -f nginx

docker-backend-logs: ## Follow backend logs
	$(COMPOSE) logs -f backend

docker-ps: ## List containers
	$(COMPOSE) ps

docker-shell-nginx: ## Shell into nginx
	$(COMPOSE) exec nginx /bin/sh

docker-shell-backend: ## Shell into backend
	$(COMPOSE) exec backend /bin/sh

docker-stop: ## Pause containers
	$(COMPOSE) stop

docker-rm: ## Remove containers
	$(COMPOSE) down --remove-orphans

docker-clean-volumes: ## Delete all data ⚠️
	@echo -e "$(RED)$(BOLD)WARNING: This will delete all persistent data (database, configs, certs)!$(NC)"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	$(COMPOSE) down -v

docker-prune: ## Free Docker space
	docker image rm $(PROJECT_NAME):nginx $(PROJECT_NAME):backend 2>/dev/null || true
	docker system prune -f

# Build
build-frontend: ## Build frontend
	@echo -e "$(CYAN)$(BOLD)Building frontend...$(NC)"
	cd $(FRONTEND_DIR) && npm ci --include=dev && npm run build
	@echo -e "$(GREEN)$(BOLD)Frontend built → $(FRONTEND_DIR)/dist/$(NC)"

build-backend: ## Build backend
	@echo -e "$(CYAN)$(BOLD)Building backend...$(NC)"
	cd $(BACKEND_DIR) && npm ci && npm run build && cp -r src/templates dist/
	@echo -e "$(GREEN)$(BOLD)Backend built → $(BACKEND_DIR)/dist/$(NC)"

build-all: build-frontend build-backend ## Build both
	@echo ""
	@echo -e "$(GREEN)$(BOLD)Build complete!$(NC)"

build-docker: build-all docker-build ## Build all + Docker

# Development
dev-frontend: ## Run frontend dev
	@echo -e "$(CYAN)$(BOLD)Starting frontend dev server...$(NC)"
	cd $(FRONTEND_DIR) && npm ci --include=dev && npm run dev

dev-backend: ## Run backend dev
	@echo -e "$(CYAN)$(BOLD)Starting backend dev server...$(NC)"
	cd $(BACKEND_DIR) && npm ci && npm run dev

dev-lint: ## Lint code
	@echo -e "$(CYAN)$(BOLD)Linting...$(NC)"
	cd $(FRONTEND_DIR) && npm run lint
	cd $(BACKEND_DIR)  && npm run lint
	@echo -e "$(GREEN)$(BOLD)Lint complete.$(NC)"

dev-format: ## Format code
	@echo -e "$(CYAN)$(BOLD)Formatting...$(NC)"
	cd $(FRONTEND_DIR) && npm run format
	cd $(BACKEND_DIR)  && npm run format
	@echo -e "$(GREEN)$(BOLD)Format complete.$(NC)"

# Setup & Clean
setup: ## Install dependencies
	@echo -e "$(CYAN)$(BOLD)Installing dependencies...$(NC)"
	cd $(FRONTEND_DIR) && npm ci --include=dev
	cd $(BACKEND_DIR)  && npm ci
	@echo -e "$(GREEN)$(BOLD)Setup complete.$(NC)"

clean: ## Remove build artifacts
	@echo -e "$(YELLOW)$(BOLD)Cleaning build artifacts...$(NC)"
	rm -rf $(FRONTEND_DIR)/dist
	rm -rf $(BACKEND_DIR)/dist
	rm -rf $(FRONTEND_DIR)/node_modules
	rm -rf $(BACKEND_DIR)/node_modules
	@echo -e "$(GREEN)$(BOLD)Clean complete.$(NC)"

clean-all: clean docker-rm ## Full clean

# Help
help: ## Show this help
	@echo ""
	@echo -e "$(CYAN)$(BOLD)Nginx Proxy Manager Modern — Available Commands$(NC)"
	@echo ""
	@echo -e "  $(BOLD)Docker:$(NC)"
	@grep -E '^docker-[^:]+:.*## ' $(MAKEFILE_LIST) | \
	        awk 'BEGIN {FS = ":.*## "}; {printf "    $(CYAN)%-28s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo -e "  $(BOLD)Build:$(NC)"
	@grep -E '^build-[^:]+:.*## ' $(MAKEFILE_LIST) | \
	        awk 'BEGIN {FS = ":.*## "}; {printf "    $(CYAN)%-28s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo -e "  $(BOLD)Development:$(NC)"
	@grep -E '^dev-[^:]+:.*## ' $(MAKEFILE_LIST) | \
	        awk 'BEGIN {FS = ":.*## "}; {printf "    $(CYAN)%-28s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo -e "  $(BOLD)Setup & Clean:$(NC)"
	@grep -E '^(setup|clean[^:]*):.*## ' $(MAKEFILE_LIST) | \
	        awk 'BEGIN {FS = ":.*## "}; {printf "    $(CYAN)%-28s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo -e "  $(BOLD)Other:$(NC)"
	@grep -E '^help:.*## ' $(MAKEFILE_LIST) | \
	        awk 'BEGIN {FS = ":.*## "}; {printf "    $(CYAN)%-28s$(NC) %s\n", $$1, $$2}'
	@echo ""
