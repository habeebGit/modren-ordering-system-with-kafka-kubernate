#!/bin/bash

echo "🚀 Setting up Modern Ordering System with Enhanced Validation"
echo "=============================================================="

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "📋 Checking prerequisites..."
if ! command_exists docker; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command_exists docker-compose; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Install Node.js dependencies for each service
echo ""
echo "📦 Installing Node.js dependencies..."

services=("order-service" "product-service" "api-gateway")
for service in "${services[@]}"; do
    if [ -d "$service" ]; then
        echo "Installing dependencies for $service..."
        cd "$service"
        if [ -f "package.json" ]; then
            npm install
            echo "✅ Dependencies installed for $service"
        else
            echo "⚠️  No package.json found in $service"
        fi
        cd ..
    else
        echo "⚠️  Directory $service not found"
    fi
done

# Stop any existing containers
echo ""
echo "🧹 Cleaning up existing containers..."
docker-compose down -v 2>/dev/null || true

# Build and start services
echo ""
echo "🔨 Building and starting services with validation..."
docker-compose up --build -d

# Wait for services to start
echo ""
echo "⏳ Waiting for services to initialize..."
sleep 30

# Check service health
echo ""
echo "🏥 Checking service health..."

services_to_check=(
    "http://localhost:3003/health|API Gateway"
    "http://localhost:3001/health|Order Service" 
    "http://localhost:3002/health|Product Service"
    "http://localhost:9090|Prometheus"
    "http://localhost:3005|Grafana"
)

for service_check in "${services_to_check[@]}"; do
    IFS='|' read -r url name <<< "$service_check"
    if curl -s "$url" > /dev/null 2>&1; then
        echo "✅ $name is healthy"
    else
        echo "❌ $name is not responding"
    fi
done

echo ""
echo "🎉 Setup complete! Your services are running:"
echo "=============================================="
echo "🌐 Frontend:        http://localhost:3000"
echo "🚪 API Gateway:     http://localhost:3003"
echo "📦 Order Service:   http://localhost:3001"
echo "🛍️  Product Service: http://localhost:3002"
echo "📊 Prometheus:      http://localhost:9090"
echo "📈 Grafana:         http://localhost:3005"
echo ""
echo "🛡️  Security Features Enabled:"
echo "   ✅ Input validation and sanitization"
echo "   ✅ Rate limiting (100 requests/15min per IP)"
echo "   ✅ XSS protection"
echo "   ✅ Security headers"
echo "   ✅ CORS configuration"
echo ""
echo "🧪 To test validation, try:"
echo "   curl -X POST http://localhost:3003/api/orders \\"
echo "        -H 'Content-Type: application/json' \\"
echo "        -d '{\"userId\": \"invalid\", \"items\": []}'"
echo ""
echo "📊 To monitor logs:"
echo "   docker-compose logs -f [service-name]"
echo ""
echo "🛑 To stop services:"
echo "   docker-compose down"
