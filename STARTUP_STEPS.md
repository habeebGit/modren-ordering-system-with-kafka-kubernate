# Startup Steps — Modern Ordering System (local evaluation / perf)

This document lists concise steps to bring up the entire application stack and sanity-check it.

Prerequisites
- Docker and docker-compose installed and working.
- Node.js and npm (for `--install` dependency option). Recommended Node 18+.
- At least 4–8 GB free memory available for containers (Postgres + Kafka + services).

Quick start (recommended)
1. Make helper scripts executable (once):
   - chmod +x ./scripts/startup.sh ./scripts/shutdown.sh

2. (Optional) Install service dependencies before starting:
   - ./scripts/startup.sh --install

3. Start the full stack (build images & run detached):
   - ./scripts/startup.sh

What `scripts/startup.sh` does
- Builds and starts containers with `docker-compose up -d --build`.
- Waits for core services (Postgres, Kafka, order-service, product-service, frontend) to be running/healthy (up to 300s).
- Prints important endpoints when ready:
  - Frontend: http://localhost:3000
  - Order service: http://localhost:3001
  - Product service: http://localhost:3002
  - Prometheus: http://localhost:9090
  - Grafana: http://localhost:3005

Sanity checks / smoke tests
- Check health endpoints:
  - curl http://localhost:3001/health
  - curl http://localhost:3002/health
- Check metrics endpoints (if enabled):
  - curl http://localhost:3001/metrics
- Open the frontend in a browser: http://localhost:3000

Running lightweight load tests (examples)
- Install `autocannon` (npm i -g autocannon):
  - autocannon -c 50 -d 30 http://localhost:3001/orders
- Or use `hey` (brew install hey):
  - hey -c 50 -z 30s http://localhost:3001/orders

Logs and troubleshooting
- Stream logs interactively:
  - docker-compose logs -f
- Inspect container logs per service:
  - docker-compose ps
  - docker logs <container-id>
- If containers fail to start, check resource limits (memory), port conflicts, and environment variables (DB host, credentials).

Stopping the stack and collecting logs
- To collect runtime logs and tear down the stack run:
  - ./scripts/shutdown.sh
- To keep volumes when shutting down:
  - ./scripts/shutdown.sh --no-remove-volumes
- The script saves per-service logs and an archive `logs-<timestamp>.tar.gz` in the repo root by default.

Run tests
- Run unit & integration tests per service (example):
  - npm --prefix ./order-service test
  - npm --prefix ./product-service test
- Run all tests from repo root (helper):
  - npm run test:all

CI
- A GitHub Actions workflow is provided at `.github/workflows/ci.yml` that executes service tests and attempts to collect logs as artifacts.

Notes & common issues
- Environment variables: the services rely on environment variables provided via `docker-compose.yml`. If running services outside docker-compose, set `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `PRODUCT_SERVICE_URL`/`ORDER_SERVICE_URL` appropriately.
- Kafka: the Compose setup uses a single-node broker for local testing. For external clients you may need to adjust advertised listeners.
- Migrations: the services currently call `sequelize.sync({ alter: true })` during startup. For serious testing or production, replace with explicit migrations.

If you want, I can:
- Add a smoke-test script that runs HTTP checks after startup,
- Add a `make` target wiring these scripts into the `Makefile`,
- Or add a parallelized load-test recipe (autocannon script) to exercise the system.
