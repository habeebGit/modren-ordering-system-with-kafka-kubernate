#!/usr/bin/env zsh
set -euo pipefail

# shutdown.sh - Save logs and tear down the docker-compose stack
# Usage: ./scripts/shutdown.sh [--no-remove-volumes] [--logs-dir DIR]
#   --no-remove-volumes : do not remove volumes (keep data)
#   --logs-dir DIR       : directory to store collected logs (default: ./logs)

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

REMOVE_VOLUMES=true
LOGS_DIR="${ROOT_DIR}/logs"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-remove-volumes)
      REMOVE_VOLUMES=false
      shift
      ;;
    --logs-dir)
      LOGS_DIR="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [--no-remove-volumes] [--logs-dir DIR]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--no-remove-volumes] [--logs-dir DIR]"
      exit 1
      ;;
  esac
done

TIMESTAMP=$(date +%Y%m%dT%H%M%S)
DEST_DIR="${LOGS_DIR}/run-${TIMESTAMP}"
mkdir -p "$DEST_DIR"

echo "Collecting docker-compose logs into $DEST_DIR/..."
# Save combined logs
docker-compose logs --no-color > "${DEST_DIR}/docker-compose.log" 2>&1 || true

# Save per-service logs (docker-compose services listed in compose file)
SERVICES_LIST=(orders_db products_db kafka zookeeper order-service product-service my-ordering-app prometheus grafana)
for svc in "${SERVICES_LIST[@]}"; do
  CID=$(docker-compose ps -q "$svc" 2>/dev/null || true)
  if [ -n "$CID" ]; then
    echo "Saving logs for $svc (container $CID)"
    docker logs "$CID" > "${DEST_DIR}/${svc}.log" 2>&1 || true
  else
    # still attempt to extract previous logs from docker-compose logs
    echo "No running container for $svc, appending compose logs for ${svc}"
    docker-compose logs "$svc" > "${DEST_DIR}/${svc}.log" 2>&1 || true
  fi
done

# Optionally collect system Docker info for debugging
echo "Collecting docker system info"
docker info > "${DEST_DIR}/docker-info.txt" 2>&1 || true
docker-compose ps --all > "${DEST_DIR}/docker-compose-ps.txt" 2>&1 || true

# Archive logs
ARCHIVE="${ROOT_DIR}/logs-${TIMESTAMP}.tar.gz"
echo "Archiving logs to ${ARCHIVE}"
tar -czf "$ARCHIVE" -C "${LOGS_DIR}" "run-${TIMESTAMP}"

# Tear down the stack
if $REMOVE_VOLUMES; then
  echo "Stopping and removing containers, networks and volumes..."
  docker-compose down -v
else
  echo "Stopping and removing containers and networks (volumes kept)..."
  docker-compose down
fi

echo "Shutdown complete. Logs archived at: ${ARCHIVE}"
exit 0
