#!/bin/sh
set -e

# Run migrations before starting the service
if [ -n "${DB_HOST-}" ]; then
  echo "Running migrations for product-service..."
  DB_HOST=${DB_HOST} DB_NAME=${DB_NAME} DB_USER=${DB_USER} DB_PASSWORD=${DB_PASSWORD} \
    npx sequelize db:migrate --config /app/sequelize-config.js --migrations-path /app/migrations || true
fi

# Start the application (as non-root user if available)
exec "$@"
