#!/bin/sh
# Minimal Kafka readiness wrapper used by docker-compose healthcheck.
# Returns 0 when Kafka responds; non-zero otherwise.

BOOTSTRAP="${KAFKA_BROKERS:-localhost:9092}"
# Use first broker if multiple
BOOTSTRAP_HOST_PORT=$(printf "%s" "$BOOTSTRAP" | awk -F',' '{print $1}')

# If kafka-topics utility is available, use it
if command -v kafka-topics >/dev/null 2>&1; then
  kafka-topics --bootstrap-server "$BOOTSTRAP_HOST_PORT" --list >/dev/null 2>&1 && exit 0 || exit 1
fi

# Fallback: try nc if available
HOST=$(printf "%s" "$BOOTSTRAP_HOST_PORT" | cut -d':' -f1)
PORT=$(printf "%s" "$BOOTSTRAP_HOST_PORT" | cut -d':' -f2)
if command -v nc >/dev/null 2>&1; then
  nc -z "$HOST" "$PORT" >/dev/null 2>&1 && exit 0 || exit 1
fi

# Additional fallback: use bash /dev/tcp probing if bash is available
if command -v bash >/dev/null 2>&1; then
  # bash supports /dev/tcp on most distributions; attempt to open the TCP socket
  if bash -c "cat < /dev/null > /dev/tcp/$HOST/$PORT" >/dev/null 2>&1; then
    exit 0
  else
    exit 1
  fi
fi

# No suitable tool available; fail healthcheck
exit 1
