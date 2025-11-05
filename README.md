# Modern Ordering System with Kafka & Kubernetes

A modern, microservices-based ordering system built with Node.js, React, PostgreSQL, and Apache Kafka for event-driven communication.

## 🏗️ Architecture Overview

This system implements a microservices architecture with the following components:

- **Frontend**: React-based web application
- **Backend Services**: Node.js microservices (Order & Product services)
- **Message Broker**: Apache Kafka for event-driven communication
- **Databases**: PostgreSQL instances for each service
- **Monitoring**: Prometheus & Grafana for observability

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Git

### Getting Started

1. **Start the System**
   ```bash
   docker-compose up -d
   ```

2. **Verify Services**
   ```bash
   docker-compose ps
   ```

## 🐳 Container Services

### Core Application Services

| Service | Container Name | Port | URL | Description |
|---------|----------------|------|-----|-------------|
| **Frontend** | `my-ordering-app` | 3000 | [http://localhost:3000](http://localhost:3000) | React-based user interface |
| **Order Service** | `order-service` | 3001 | [http://localhost:3001](http://localhost:3001) | Order management microservice |
| **Product Service** | `product-service` | 3002 | [http://localhost:3002](http://localhost:3002) | Product catalog microservice |

### Infrastructure Services

| Service | Container Name | Port | URL | Description |
|---------|----------------|------|-----|-------------|
| **Orders Database** | `orders_db` | 5434 | `localhost:5434` | PostgreSQL database for orders |
| **Products Database** | `products_db` | 5433 | `localhost:5433` | PostgreSQL database for products |
| **Kafka Broker** | `kafka` | 9092 | `localhost:9092` | Message broker for event streaming |
| **Zookeeper** | `zookeeper` | 2181 | `localhost:2181` | Kafka cluster coordination |

### Monitoring & Analytics

| Service | Container Name | Port | URL | Description |
|---------|----------------|------|-----|-------------|
| **Prometheus** | `prometheus` | 9090 | [http://localhost:9090](http://localhost:9090) | Metrics collection & monitoring |
| **Grafana** | `grafana` | 3005 | [http://localhost:3005](http://localhost:3005) | Metrics visualization dashboard |

## 🛠️ Docker Compose Commands

### Starting Services
```bash
# Start all services in detached mode
docker-compose up -d

# Start with build (recommended for first run)
docker-compose up --build

# Start specific service
docker-compose up -d order-service

# View logs
docker-compose logs -f order-service
```

### Managing Services
```bash
# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ This will delete database data)
docker-compose down -v

# Rebuild services
docker-compose build

# Restart a service
docker-compose restart order-service
```

### Monitoring
```bash
# View running containers
docker-compose ps

# View logs for all services
docker-compose logs -f

# View logs for specific service
docker-compose logs -f product-service
```

## 🌐 Service Endpoints

### Frontend Application
- **URL**: http://localhost:3000
- **Description**: Main user interface for the ordering system

### Order Service API
- **Base URL**: http://localhost:3001
- **Health Check**: `GET /health`
- **API Endpoints**:
  - `GET /orders` - List all orders
  - `POST /orders` - Create new order
  - `GET /orders/:id` - Get order details

### Product Service API
- **Base URL**: http://localhost:3002
- **Health Check**: `GET /health`
- **API Endpoints**:
  - `GET /products` - List all products
  - `POST /decrement-stock` - Decrement product stock
  - `GET /products/:id` - Get product details

## 📊 Monitoring & Observability

### Prometheus Metrics
Access Prometheus at [http://localhost:9090](http://localhost:9090) to:
- View system metrics
- Query custom metrics
- Monitor service health

### Grafana Dashboards
Access Grafana at [http://localhost:3005](http://localhost:3005) to:
- Visualize metrics in dashboards
- Set up alerts
- Monitor system performance

## 🗄️ Database Access

### Orders Database
```bash
# Connect to orders database
docker exec -it modren-ordering-system-with-kafka-orders_db-1 psql -U orders_user -d orders_db
```

### Products Database
```bash
# Connect to products database
docker exec -it modren-ordering-system-with-kafka-products_db-1 psql -U products_user -d products_db
```

## 🔄 Kafka Integration

### Kafka Topics
The system uses Kafka for event-driven communication between services:
- Order events (order created, updated, cancelled)
- Product events (product added, updated, stock changes)

### Accessing Kafka
```bash
# Access Kafka container
docker exec -it modren-ordering-system-with-kafka-kafka-1 bash

# List topics
kafka-topics --bootstrap-server localhost:9092 --list

# Consume messages from a topic
kafka-console-consumer --bootstrap-server localhost:9092 --topic orders --from-beginning
```

## 🧪 Testing & Health Checks

### Health Checks
```bash
# Check all services health
curl http://localhost:3001/health  # Order Service
curl http://localhost:3002/health  # Product Service
```

### API Testing
Use tools like Postman, curl, or any HTTP client to test the APIs:

```bash
# Example: Create a new product
curl -X POST http://localhost:3002/products \
  -H "Content-Type: application/json" \
  -d '{"name": "Sample Product", "price": 29.99}'
```

## 🚨 Troubleshooting

### Common Issues

1. **Port Conflicts**
   - Ensure ports 3000-3002, 5433-5434, 9090, 9092, 2181, 3005 are available
   - Use `docker-compose ps` to check container status

2. **Database Connection Issues**
   - Check if database containers are running
   - Verify environment variables in `.env` file

3. **Platform Warnings (Apple Silicon)**
   - Warnings about linux/amd64 vs linux/arm64/v8 are normal on M1/M2 Macs
   - Services will run correctly despite the warnings

4. **Network Issues**
   - Run `docker-compose down --remove-orphans` to clean up
   - Restart with `docker-compose up -d`

### Logs & Debugging
```bash
# View all logs
docker-compose logs

# View logs for specific service with timestamps
docker-compose logs -f -t order-service

# Check container resource usage
docker stats
```

## ⚙️ Environment Variables

The system uses environment variables defined in the `.env` file:

```env
# Database Configuration
POSTGRES_USER=products_user
POSTGRES_PASSWORD=products_password
POSTGRES_DB=products_db

ORDERS_POSTGRES_USER=orders_user
ORDERS_POSTGRES_PASSWORD=orders_password
ORDERS_POSTGRES_DB=orders_db

# Kafka Configuration
KAFKA_BROKERS=kafka:9092

# Service URLs
PRODUCT_SERVICE_URL=http://product-service:3002
REACT_APP_ORDER_SERVICE_URL=http://localhost:3001
REACT_APP_PRODUCT_SERVICE_URL=http://localhost:3002
```

## 📁 Project Structure
```
├── docker-compose.yml          # Container orchestration
├── .env                       # Environment variables
├── prometheus.yml             # Prometheus configuration
├── order-service/            # Order microservice
│   ├── Dockerfile
│   ├── package.json
│   └── index.js
├── product-service/          # Product microservice
│   ├── Dockerfile
│   ├── package.json
│   └── index.js
└── my-ordering-app/          # React frontend
    ├── Dockerfile
    └── package.json
```

## 🚀 Next Steps & Improvements

For detailed improvement recommendations and implementation roadmap, see:
- **[IMPROVEMENT_RECOMMENDATIONS.md](./IMPROVEMENT_RECOMMENDATIONS.md)** - Comprehensive analysis and improvement suggestions

## 📚 Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Kafka Documentation](https://kafka.apache.org/documentation/)
- [Prometheus Monitoring](https://prometheus.io/docs/)
- [Grafana Dashboards](https://grafana.com/docs/)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

**Happy Coding! 🎉**