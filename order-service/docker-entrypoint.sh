#!/bin/sh
set -e

if [ -n "${DB_HOST-}" ]; then
  echo "Running migrations for order-service..."
  DB_HOST=${DB_HOST} DB_NAME=${DB_NAME} DB_USER=${DB_USER} DB_PASSWORD=${DB_PASSWORD} \
    npx sequelize db:migrate --config /app/sequelize-config.js --migrations-path /app/migrations || true
fi

exec "$@"
