#!/usr/bin/env zsh
set -euo pipefail

# startup.sh - Bring up the full application stack for local evaluation / performance testing
# Usage: ./scripts/startup.sh [--install]
#   --install : run npm ci in service folders before starting

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

INSTALL_DEPS=false
if [ "${1:-}" = "--install" ]; then
  INSTALL_DEPS=true
fi

if $INSTALL_DEPS; then
  echo "Installing npm dependencies for services..."
  for d in order-service product-service my-ordering-app; do
    if [ -d "$d" ]; then
      echo "-> Installing in $d"
      (cd "$d" && npm ci)
    fi
  done
fi

echo "Starting docker-compose services (detached, building images)..."
docker-compose up -d --build

# Services to wait for (must match docker-compose service names)
SERVICES=(orders_db products_db kafka order-service product-service my-ordering-app)
TIMEOUT=300  # seconds
INTERVAL=5   # polling interval
ELAPSED=0

echo "Waiting for services to become healthy (timeout: ${TIMEOUT}s)..."
while [ $ELAPSED -lt $TIMEOUT ]; do
  ALL_OK=true
  for svc in "${SERVICES[@]}"; do
    CID=$(docker-compose ps -q "$svc" 2>/dev/null || true)
    if [ -z "$CID" ]; then
      ALL_OK=false
      break
    fi

    # Check if container has a health check
    HS_JSON=$(docker inspect --format='{{json .State.Health}}' "$CID" 2>/dev/null || echo "null")
    if [ "$HS_JSON" != "null" ]; then
      STATUS=$(docker inspect --format='{{(index .State.Health.Status)}}' "$CID" 2>/dev/null || echo "")
      if [ "$STATUS" != "healthy" ]; then
        ALL_OK=false
        break
      fi
    else
      # No health metadata; fallback to running state
      RUNNING=$(docker inspect --format='{{.State.Running}}' "$CID" 2>/dev/null || echo "false")
      if [ "$RUNNING" != "true" ]; then
        ALL_OK=false
        break
      fi
    fi
  done

  if $ALL_OK; then
    echo "All services are running / healthy"
    break
  fi

  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
  echo "Waiting... ${ELAPSED}s elapsed"
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  echo "Timeout waiting for services. Check 'docker-compose ps' and logs: 'docker-compose logs -f'"
  exit 1
fi

cat <<EOF

Application started. Key endpoints:
 - Frontend: http://localhost:3000
 - Order service: http://localhost:3001
 - Product service: http://localhost:3002
 - Prometheus: http://localhost:9090
 - Grafana: http://localhost:3005
 - Kafka broker: localhost:9092

To run a quick load test, install a tool such as 'autocannon' or 'hey'. Examples:
 - autocannon (npm i -g autocannon): autocannon -c 100 -d 30 http://localhost:3000/
 - hey (brew install hey): hey -c 100 -z 30s http://localhost:3000/

To stop the stack: docker-compose down
EOF

exit 0
