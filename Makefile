.PHONY: install-backend seed-demo reset-demo-orders test-backend check-backend build-frontend docker-up docker-down presentation-up presentation-down validate deploy-check

install-backend:
	backend/.venv/bin/pip install -r backend/requirements.txt

seed-demo:
	cd backend && .venv/bin/python scripts/seed_demo.py

reset-demo-orders:
	cd backend && .venv/bin/python scripts/reset_demo_orders.py

test-backend:
	backend/.venv/bin/pytest backend/tests

check-backend:
	python3 -m compileall backend/app

build-frontend:
	cd frontend && npm run build

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

presentation-up: seed-demo
	docker compose -f docker-compose.prod.yml up -d --build

presentation-down:
	docker compose -f docker-compose.prod.yml down

validate: check-backend test-backend build-frontend

deploy-check: validate
	docker build -f Dockerfile.api -t delivery-saas-api-deploy-check .
