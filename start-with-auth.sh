#!/bin/bash

echo "🚀 Starting Modern Ordering System with JWT Authentication..."

# Stop any running containers
echo "📋 Stopping existing containers..."
docker-compose down -v

# Build and start all services including auth
echo "🔨 Building and starting all services..."
docker-compose up --build -d

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 30

# Check service status
echo "📊 Checking service status..."
docker-compose ps

echo ""
echo "✅ JWT Authentication System Deployed!"
echo ""
echo "🌐 Service URLs:"
echo "   Frontend:        http://localhost:3000"
echo "   API Gateway:     http://localhost:3003"
echo "   Auth Service:    http://localhost:3004"
echo "   Order Service:   http://localhost:3001"
echo "   Product Service: http://localhost:3002"
echo ""
echo "🔐 Demo Credentials:"
echo "   Email:    admin@ordering.com"
echo "   Password: Admin123!@#"
echo "   Role:     admin"
echo ""
echo "📚 Available Auth Endpoints:"
echo "   POST /api/auth/register - Register new user"
echo "   POST /api/auth/login    - Login user"
echo "   POST /api/auth/refresh  - Refresh token"
echo "   GET  /api/auth/profile  - Get user profile"
echo "   POST /api/auth/logout   - Logout user"
echo ""
echo "🛡️ Security Features:"
echo "   ✅ JWT Access & Refresh Tokens"
echo "   ✅ Password Hashing (bcrypt)"
echo "   ✅ Rate Limiting"
echo "   ✅ Role-based Authorization"
echo "   ✅ Input Validation"
echo "   ✅ Token Validation Service"
echo ""echo "🎉 Setup complete! Your services are running with authentication."