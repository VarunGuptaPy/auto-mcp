.PHONY: dev test lint install install-frontend docker-build docker-up docker-down

# ── Local development ────────────────────────────────────────────────────── #

install:
	pip install -r requirements.txt
	playwright install chromium

install-frontend:
	cd frontend && npm install

# Run both servers in parallel (Ctrl-C stops both)
dev:
	@trap 'kill 0' SIGINT; \
	  PYTHONPATH=. uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000 & \
	  cd frontend && npm run dev; \
	  wait

# ── Tests ─────────────────────────────────────────────────────────────────── #

test:
	PYTHONPATH=. pytest tests/ -v

test-security:
	PYTHONPATH=. pytest tests/test_security.py -v

test-jobs:
	PYTHONPATH=. pytest tests/test_jobs.py -v

test-runner:
	PYTHONPATH=. pytest tests/test_runner.py -v

# ── Docker ────────────────────────────────────────────────────────────────── #

docker-build:
	docker compose build

docker-up:
	docker compose up

docker-down:
	docker compose down
