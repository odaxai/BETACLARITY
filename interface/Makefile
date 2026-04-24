# BetaSR Docker Management Makefile
# Use this file to manage Docker containers for the BetaSR project

# Load environment variables from docker-build.env
ifneq (,$(wildcard ./docker-build.env))
    include docker-build.env
    export
endif

# Set default values
DOCKER_BUILDKIT ?= 1
BUILDKIT_PROGRESS ?= plain
TMPDIR ?= /home/docker-tmp

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m # No Color

.PHONY: help build up down restart logs logs-backend logs-frontend clean prune status health build-frontend build-backend up-backend up-frontend up-full dev-backend dev-frontend dev-full test-backend test-frontend test-full prod-up prod-down

help: ## Show this help message
	@echo "$(GREEN)BetaSR Docker Management$(NC)"
	@echo "Available commands:"
	@awk 'BEGIN {FS = ":.*##"; printf "\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(YELLOW)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Build Commands

build: ## Build all Docker images
	@echo "$(GREEN)Building all Docker images...$(NC)"
	docker-compose build

build-backend: ## Build only backend Docker image
	@echo "$(GREEN)Building backend image...$(NC)"
	docker buildx build --platform linux/amd64 -f backend/Dockerfile.fast -t betasr-backend-fast --load ./backend

build-frontend: ## Build only frontend Docker image
	@echo "$(GREEN)Building frontend image...$(NC)"
	docker-compose build frontend

##@ Service Management

up: up-full ## Start all services (alias for up-full)

up-full: ## Start both frontend and backend services
	@echo "$(GREEN)Starting full BetaSR stack...$(NC)"
	docker-compose up -d
	@echo "$(GREEN)Services started!$(NC)"
	@echo "Frontend: http://localhost:3000"
	@echo "Backend:  http://localhost:8000"

up-backend: ## Start only backend service
	@echo "$(GREEN)Starting backend service...$(NC)"
	docker-compose up -d backend

up-frontend: ## Start only frontend service  
	@echo "$(GREEN)Starting frontend service...$(NC)"
	docker-compose up -d frontend

down: ## Stop all services
	@echo "$(YELLOW)Stopping all services...$(NC)"
	docker-compose down

restart: down up ## Restart all services

##@ Logging

logs: ## Show logs for all services
	docker-compose logs -f

logs-backend: ## Show backend logs only
	docker-compose logs -f backend

logs-frontend: ## Show frontend logs only
	docker-compose logs -f frontend

##@ Health and Status

status: ## Show status of all containers
	@echo "$(GREEN)Container Status:$(NC)"
	docker-compose ps
	@echo "\n$(GREEN)Images:$(NC)"
	docker images | grep betasr

health: ## Check health of all services
	@echo "$(GREEN)Backend Health:$(NC)"
	@curl -s http://localhost:8000/health | python -m json.tool || echo "$(RED)Backend not responding$(NC)"
	@echo "\n$(GREEN)Frontend Health:$(NC)"
	@curl -s -I http://localhost:3000 | head -1 || echo "$(RED)Frontend not responding$(NC)"

##@ Development

dev-backend: ## Run backend in development mode (rebuild + start)
	@echo "$(GREEN)Development backend startup...$(NC)"
	$(MAKE) build-backend
	$(MAKE) up-backend
	$(MAKE) logs-backend

dev-frontend: ## Run frontend in development mode (rebuild + start)
	@echo "$(GREEN)Development frontend startup...$(NC)"
	$(MAKE) build-frontend  
	$(MAKE) up-frontend
	$(MAKE) logs-frontend

dev-full: ## Run full stack in development mode (rebuild + start + logs)
	@echo "$(GREEN)Development full stack startup...$(NC)"
	$(MAKE) build
	$(MAKE) up-full
	$(MAKE) logs

##@ Testing

test-backend: ## Run backend API tests
	@echo "$(GREEN)Testing backend API...$(NC)"
	python test_backend_docker.py

test-frontend: ## Test frontend accessibility
	@echo "$(GREEN)Testing frontend...$(NC)"
	@curl -s -f http://localhost:3000 > /dev/null && echo "$(GREEN)✅ Frontend responding$(NC)" || echo "$(RED)❌ Frontend not responding$(NC)"

test-full: ## Run complete test suite
	@echo "$(GREEN)Running full test suite...$(NC)"
	$(MAKE) test-backend
	$(MAKE) test-frontend

##@ Maintenance

clean: ## Clean up containers and volumes
	@echo "$(YELLOW)Cleaning containers and volumes...$(NC)"
	docker-compose down -v
	docker container prune -f
	docker volume prune -f

prune: ## Deep clean (remove images, containers, volumes)
	@echo "$(RED)Deep cleaning Docker resources...$(NC)"
	docker-compose down -v --rmi all
	docker system prune -af
	docker volume prune -f

disk-usage: ## Show disk usage
	@echo "$(GREEN)Disk Usage:$(NC)"
	df -h / /home
	@echo "\n$(GREEN)Docker Usage:$(NC)"
	docker system df

##@ Production

prod-up: ## Start in production mode with nginx
	@echo "$(GREEN)Starting production stack...$(NC)"
	docker-compose --profile production up -d

prod-down: ## Stop production stack
	docker-compose --profile production down

##@ Development

shell-backend: ## Open shell in backend container
	docker-compose exec backend /bin/bash

shell-frontend: ## Open shell in frontend container
	docker-compose exec frontend /bin/sh

dev: ## Start development environment
	@echo "$(GREEN)Starting development environment...$(NC)"
	@export TMPDIR=$(TMPDIR) && docker-compose up --build

##@ GPU and System

gpu-info: ## Show GPU information
	@echo "$(GREEN)GPU Information:$(NC)"
	@docker run --rm --gpus all nvidia/cuda:11.0-runtime-ubuntu20.04 nvidia-smi 2>/dev/null || echo "GPU not available"

clean-cache: ## Clean Docker build cache
	@echo "$(YELLOW)Cleaning Docker build cache...$(NC)"
	@rm -rf $(TMPDIR)/cache/*
	@docker builder prune -f
	@echo "$(GREEN)Cache cleaned!$(NC)"

##@ GitLab Container Registry

gitlab-deploy: ## Show GitLab deployment instructions
	@chmod +x deploy-gitlab.sh && ./deploy-gitlab.sh

gitlab-up: ## Start services with GitLab registry images
	@echo "$(GREEN)Starting services with GitLab images...$(NC)"
	docker-compose -f docker-compose.gitlab.yml up -d

gitlab-down: ## Stop GitLab services
	@echo "$(YELLOW)Stopping GitLab services...$(NC)"
	docker-compose -f docker-compose.gitlab.yml down

gitlab-logs: ## Show GitLab services logs
	@echo "$(GREEN)GitLab services logs:$(NC)"
	docker-compose -f docker-compose.gitlab.yml logs -f

save-images: ## Save Docker images as compressed files
	@echo "$(GREEN)Saving Docker images...$(NC)"
	@docker save betasr_interface-frontend:latest | gzip > betasr-frontend-latest.tar.gz
	@docker save betasr-backend-fast:latest | gzip > betasr-backend-latest.tar.gz

##@ BetaVisionQA

betavisionqa-build: ## Build BetaVisionQA backend image
	@echo "$(GREEN)Building BetaVisionQA backend...$(NC)"
	docker-compose -f docker-compose.betavisionqa.yml build

betavisionqa-up: ## Start BetaVisionQA services
	@echo "$(GREEN)Starting BetaVisionQA services...$(NC)"
	docker-compose -f docker-compose.betavisionqa.yml up -d

betavisionqa-down: ## Stop BetaVisionQA services
	@echo "$(YELLOW)Stopping BetaVisionQA services...$(NC)"
	docker-compose -f docker-compose.betavisionqa.yml down

betavisionqa-logs: ## Show BetaVisionQA logs
	@echo "$(GREEN)BetaVisionQA logs:$(NC)"
	docker-compose -f docker-compose.betavisionqa.yml logs -f

betavisionqa-logs-backend: ## Show BetaVisionQA backend logs
	@echo "$(GREEN)BetaVisionQA backend logs:$(NC)"
	docker-compose -f docker-compose.betavisionqa.yml logs -f betavisionqa-backend

betavisionqa-restart: ## Restart BetaVisionQA services
	@echo "$(YELLOW)Restarting BetaVisionQA services...$(NC)"
	$(MAKE) betavisionqa-down
	$(MAKE) betavisionqa-up

betavisionqa-health: ## Check BetaVisionQA backend health
	@echo "$(GREEN)BetaVisionQA Backend Health:$(NC)"
	@curl -s http://localhost:8001/health | python -m json.tool || echo "$(RED)Backend not responding$(NC)"
	@echo "\n$(GREEN)Frontend Health:$(NC)"
	@curl -s -I http://localhost:3001 | head -1 || echo "$(RED)Frontend not responding$(NC)"

betavisionqa-status: ## Show BetaVisionQA container status
	@echo "$(GREEN)BetaVisionQA Container Status:$(NC)"
	docker-compose -f docker-compose.betavisionqa.yml ps

betavisionqa-shell: ## Open shell in BetaVisionQA backend container
	docker-compose -f docker-compose.betavisionqa.yml exec betavisionqa-backend /bin/bash

##@ BetaVisionQA Simple (Quick Test)

betavisionqa-simple-build: ## Build BetaVisionQA simple version
	@echo "$(GREEN)Building BetaVisionQA simple version...$(NC)"
	docker-compose -f docker-compose.betavisionqa-simple.yml build

betavisionqa-simple-up: ## Start BetaVisionQA simple services
	@echo "$(GREEN)Starting BetaVisionQA simple services...$(NC)"
	docker-compose -f docker-compose.betavisionqa-simple.yml up -d

betavisionqa-simple-down: ## Stop BetaVisionQA simple services
	@echo "$(YELLOW)Stopping BetaVisionQA simple services...$(NC)"
	docker-compose -f docker-compose.betavisionqa-simple.yml down

betavisionqa-simple-logs: ## Show BetaVisionQA simple logs
	@echo "$(GREEN)BetaVisionQA simple logs:$(NC)"
	docker-compose -f docker-compose.betavisionqa-simple.yml logs -f

betavisionqa-simple-logs-backend: ## Show BetaVisionQA simple backend logs
	@echo "$(GREEN)BetaVisionQA simple backend logs:$(NC)"
	docker-compose -f docker-compose.betavisionqa-simple.yml logs -f betavisionqa-backend-simple

##@ Image Management

save-images-extended: ## Save all Docker images as compressed files
	@echo "$(GREEN)Saving Docker images...$(NC)"
	@docker save betasr_interface-frontend:latest | gzip > betasr-frontend-latest.tar.gz
	@docker save betasr-backend-fast:latest | gzip > betasr-backend-latest.tar.gz
	@echo "$(GREEN)✅ Images saved:$(NC)"
	@ls -lh *.tar.gz 2>/dev/null || echo "No image files found"

load-images: ## Load Docker images from compressed files
	@echo "$(GREEN)Loading Docker images...$(NC)"
	@docker load < betasr-frontend-latest.tar.gz
	@docker load < betasr-backend-latest.tar.gz
	@echo "$(GREEN)✅ Images loaded successfully$(NC)" 