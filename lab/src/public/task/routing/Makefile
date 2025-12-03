SHELL := /bin/sh

default: up

build:
	docker compose build

up: build
	docker compose up -d
	@echo
	@echo "Containers are up. Open shells with:"
	@echo "  make sh-leaf01 | make sh-router | make sh-leaf02"

down:
	docker compose down -v

reset: down up

status:
	docker compose ps
	docker compose exec leaf01 ip route || true
	docker compose exec leaf02 ip route || true
	docker compose exec router ip -br a || true

grade:
	scripts/grade.sh

solution:
	scripts/solution.sh

sh-%:
	docker compose exec $* sh
