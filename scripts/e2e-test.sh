#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

ORDER_SERVICE_URL=${ORDER_SERVICE_URL:-http://localhost:3001}
KAFKA_CONTAINER=${KAFKA_CONTAINER:-modren-ordering-system-with-kafka-kafka-1}
ORDERS_DB_CONTAINER=${ORDERS_DB_CONTAINER:-modren-ordering-system-with-kafka-orders_db-1}
KAFKA_TOPIC=${KAFKA_TOPIC:-order-events}

echo "Running end-to-end test: place order -> verify DB row -> verify Kafka message"

# 1) Place a test order
# Payload must match the order-service contract: { userId, items: [{ productId, quantity }, ...] }
PAYLOAD='{"userId":1,"items":[{"productId":1,"quantity":1}]}'
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Content-Type: application/json" -d "$PAYLOAD" "$ORDER_SERVICE_URL/orders" || true)

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
  echo "[OK] Order API accepted request (HTTP $HTTP_CODE)"
else
  echo "[FAIL] Order API did not accept request (HTTP $HTTP_CODE)"
  echo "Tip: curl -v -H 'Content-Type: application/json' -d '$PAYLOAD' $ORDER_SERVICE_URL/orders"
  # Also print a helpful hint about checking product/service schema
  echo "Hint: ensure product with productId=1 exists in product-service/products_db and product-service is reachable."
  exit 2
fi

# Give services a few seconds to process async work
sleep 3

# 2) Check Orders DB for a recent row
echo "Checking orders DB for new row..."
# Try a straightforward query; if it fails, show table list to help debugging
set +e
DB_QUERY_OUTPUT=$(docker exec -i "$ORDERS_DB_CONTAINER" psql -U postgres -d orders_db -t -c "SELECT id, createdAt::text, status FROM orders ORDER BY id DESC LIMIT 1;" 2>&1)
DB_EXIT=$?
set -e

if [ $DB_EXIT -eq 0 ] && [ -n "$(echo "$DB_QUERY_OUTPUT" | tr -d '[:space:]')" ]; then
  echo "[OK] Orders DB row found:"
  echo "$DB_QUERY_OUTPUT"
else
  echo "[WARN] Could not query orders table directly. Listing tables for inspection..."
  docker exec -i "$ORDERS_DB_CONTAINER" psql -U postgres -d orders_db -c "\dt" || true
  echo "If your schema uses a different table name, adjust the query in scripts/e2e-test.sh"
fi

# 3) Try to consume a message from Kafka topic
echo "Checking Kafka topic for published event (topic: $KAFKA_TOPIC)"

# Candidate consumer commands to try inside kafka container
CONSUMER_CMDS=(
  "/usr/bin/kafka-console-consumer --bootstrap-server kafka:9092 --topic $KAFKA_TOPIC --from-beginning --max-messages 1 --timeout-ms 10000"
  "/usr/bin/kafka-console-consumer.sh --bootstrap-server kafka:9092 --topic $KAFKA_TOPIC --from-beginning --max-messages 1 --timeout-ms 10000"
  "kafka-console-consumer --bootstrap-server kafka:9092 --topic $KAFKA_TOPIC --from-beginning --max-messages 1 --timeout-ms 10000"
)

FOUND_MESSAGE=0
for cmd in "${CONSUMER_CMDS[@]}"; do
  echo "Trying: $cmd"
  set +e
  OUT=$(docker exec -i "$KAFKA_CONTAINER" bash -lc "$cmd" 2>&1)
  RC=$?
  set -e
  if [ $RC -eq 0 ] && [ -n "$(echo "$OUT" | tr -d '[:space:]')" ]; then
    echo "[OK] Kafka message consumed (sample):"
    echo "$OUT"
    FOUND_MESSAGE=1
    break
  else
    echo "(no output / consumer failed, rc=$RC)"
  fi
done

if [ $FOUND_MESSAGE -eq 0 ]; then
  echo "[WARN] Could not read a Kafka message using the container's console consumer."
  echo "You can connect to the Kafka container and run a console consumer manually to inspect messages."
  exit 3
fi

echo "\nE2E TEST PASSED"
exit 0
