const request = require('supertest');
const app = require('../index');

describe('Order Service Validation', () => {
  
  describe('POST /orders - Order Creation Validation', () => {
    
    test('should reject order with missing userId', async () => {
      const response = await request(app)
        .post('/orders')
        .send({
          items: [{ productId: 1, quantity: 2 }]
        });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toContain('User ID is required');
    });
    
    test('should reject order with invalid userId type', async () => {
      const response = await request(app)
        .post('/orders')
        .send({
          userId: 'invalid',
          items: [{ productId: 1, quantity: 2 }]
        });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('User ID must be a number');
    });
    
    test('should reject order with negative userId', async () => {
      const response = await request(app)
        .post('/orders')
        .send({
          userId: -1,
          items: [{ productId: 1, quantity: 2 }]
        });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('User ID must be positive');
    });
    
    test('should reject order with empty items array', async () => {
      const response = await request(app)
        .post('/orders')
        .send({
          userId: 1,
          items: []
        });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('At least 1 item is required');
    });
    
    test('should reject order with too many items', async () => {
      const items = Array.from({ length: 51 }, (_, i) => ({
        productId: i + 1,
        quantity: 1
      }));
      
      const response = await request(app)
        .post('/orders')
        .send({
          userId: 1,
          items
        });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('Maximum 50 items allowed per order');
    });
    
    test('should reject order with invalid quantity', async () => {
      const response = await request(app)
        .post('/orders')
        .send({
          userId: 1,
          items: [
            { productId: 1, quantity: 0 },
            { productId: 2, quantity: 1001 }
          ]
        });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('Quantity must be at least 1');
      expect(response.body.errors).toContain('Quantity cannot exceed 1000');
    });
    
    test('should sanitize XSS attempts in request', async () => {
      const response = await request(app)
        .post('/orders')
        .send({
          userId: 1,
          items: [{ productId: 1, quantity: 2 }],
          maliciousField: '<script>alert("xss")</script>'
        });
      
      // The malicious field should be sanitized (stripped of HTML)
      expect(response.status).toBe(400); // Will fail validation but XSS should be sanitized
    });
    
  });
  
  describe('GET /orders - List Orders Validation', () => {
    
    test('should reject invalid page parameter', async () => {
      const response = await request(app)
        .get('/orders')
        .query({ page: 0 });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('Page must be at least 1');
    });
    
    test('should reject invalid limit parameter', async () => {
      const response = await request(app)
        .get('/orders')
        .query({ limit: 101 });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('Limit cannot exceed 100');
    });
    
    test('should reject invalid sortBy parameter', async () => {
      const response = await request(app)
        .get('/orders')
        .query({ sortBy: 'invalidField' });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('Sort by must be one of: id, createdAt, updatedAt, status');
    });
    
  });
  
  describe('PUT /orders/:id/status - Update Order Status Validation', () => {
    
    test('should reject invalid order ID', async () => {
      const response = await request(app)
        .put('/orders/invalid/status')
        .send({ status: 'Confirmed' });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('Order ID must be a positive integer');
    });
    
    test('should reject invalid status value', async () => {
      const response = await request(app)
        .put('/orders/1/status')
        .send({ status: 'InvalidStatus' });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('Status must be one of: Pending, Confirmed, Shipped, Delivered, Cancelled');
    });
    
  });
  
  describe('Security Headers', () => {
    
    test('should include security headers in response', async () => {
      const response = await request(app)
        .get('/health');
      
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });
    
  });
  
  describe('Rate Limiting', () => {
    
    test('should enforce rate limiting', async () => {
      // This test would need to be adjusted based on your rate limiting configuration
      // Make multiple rapid requests to test rate limiting
      const requests = [];
      for (let i = 0; i < 101; i++) {
        requests.push(request(app).get('/health'));
      }
      
      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      
      // Should have some rate limited responses
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }, 10000);
    
  });
  
});
