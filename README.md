# Modern Ordering System

## Services

- **order-service**: Handles orders and communicates with Kafka.
- **product-service**: Manages products and stock.
- **my-ordering-app**: React frontend.

## Running Locally

```bash
docker-compose up --build
```

## API Endpoints

- **Order Service**
  - `GET /orders`
  - `POST /orders`
- **Product Service**
  - `GET /products`
  - `POST /decrement-stock`

## Health Checks

- `GET /health` on all services

## Environment Variables

See `docker-compose.yml` for all variables.