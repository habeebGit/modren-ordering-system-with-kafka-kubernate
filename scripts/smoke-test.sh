#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

echo "Running smoke tests for Modern Ordering System"
failures=0

check_http() {
  local name="$1"; local url="$2"
  printf '%s' "- Checking $name at $url ... "
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" || echo "000")
  if [[ "$http_code" =~ ^2[0-9]{2}$ ]]; then
    echo "OK ($http_code)"
  else
    echo "FAIL ($http_code)"
    failures=$((failures+1))
  fi
}

check_kafka() {
  printf '%s' "- Checking Kafka (via $SCRIPT_DIR/kafka-ready.sh) ... "
  if KAFKA_BROKERS=${KAFKA_BROKERS:-localhost:9092} "$SCRIPT_DIR/kafka-ready.sh" >/dev/null 2>&1; then
    echo "OK"
  else
    echo "FAIL"
    failures=$((failures+1))
  fi
}

# HTTP health endpoints
check_http "Order service" "http://localhost:3001/health"
check_http "Product service" "http://localhost:3002/health"
# Frontend may not expose /health; check root for 200
check_http "Frontend" "http://localhost:3000/"

# Kafka readiness
check_kafka

if [ "$failures" -eq 0 ]; then
  printf '\nSMOKE TESTS PASSED: All checks OK\n'
  exit 0
else
  printf '\nSMOKE TESTS FAILED: %s failing checks\n' "${failures}"
  exit 2
fi
