#!/bin/bash

echo "🧪 Testing Input Validation and Security Features"
echo "================================================="

API_BASE="http://localhost:3003/api"

echo ""
echo "1️⃣  Testing Order Creation Validation..."
echo "----------------------------------------"

echo "❌ Testing invalid user ID (should fail):"
curl -s -X POST "$API_BASE/orders" \
  -H "Content-Type: application/json" \
  -d '{"userId": -1, "items": [{"productId": 1, "quantity": 2}]}' | jq .

echo ""
echo "❌ Testing missing items (should fail):"
curl -s -X POST "$API_BASE/orders" \
  -H "Content-Type: application/json" \
  -d '{"userId": 1, "items": []}' | jq .

echo ""
echo "❌ Testing XSS attempt (should be sanitized):"
curl -s -X POST "$API_BASE/orders" \
  -H "Content-Type: application/json" \
  -d '{"userId": 1, "items": [{"productId": 1, "quantity": 2}], "malicious": "<script>alert(\"xss\")</script>"}' | jq .

echo ""
echo "2️⃣  Testing Product Creation Validation..."
echo "-----------------------------------------"

echo "❌ Testing invalid product name (should fail):"
curl -s -X POST "$API_BASE/products" \
  -H "Content-Type: application/json" \
  -d '{"name": "A", "price": -10, "stock": -5}' | jq .

echo ""
echo "❌ Testing invalid price (should fail):"
curl -s -X POST "$API_BASE/products" \
  -H "Content-Type: application/json" \
  -d '{"name": "Valid Product", "price": 1000000, "stock": 10}' | jq .

echo ""
echo "3️⃣  Testing Rate Limiting..."
echo "----------------------------"
echo "Making 10 rapid requests (should show rate limiting after threshold):"

for i in {1..10}; do
  response=$(curl -s -w "%{http_code}" -o /dev/null "$API_BASE/../health")
  if [ "$response" = "429" ]; then
    echo "🚫 Request $i: Rate limited (HTTP $response)"
    break
  else
    echo "✅ Request $i: Success (HTTP $response)"
  fi
  sleep 0.1
done

echo ""
echo "4️⃣  Testing Security Headers..."
echo "------------------------------"
echo "Checking security headers on API Gateway:"
curl -s -I http://localhost:3003/health | grep -E "(X-Content-Type-Options|X-Frame-Options|X-XSS-Protection)"

echo ""
echo "5️⃣  Testing Valid Requests..."
echo "-----------------------------"

echo "✅ Creating valid product:"
curl -s -X POST "$API_BASE/products" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Product",
    "description": "A valid test product",
    "price": 19.99,
    "stock": 100,
    "category": "Electronics",
    "sku": "TEST-001"
  }' | jq .

echo ""
echo "✅ Getting products with pagination:"
curl -s "$API_BASE/products?page=1&limit=10&sortBy=name&sortOrder=ASC" | jq .

echo ""
echo "✅ Testing completed! 🎉"
echo ""
echo "🔍 Check the responses above to see:"
echo "   • Validation errors for invalid input"
echo "   • XSS prevention in action"
echo "   • Rate limiting behavior"
echo "   • Security headers present"
echo "   • Successful valid requests"
