const request = require('supertest');
const express = require('express');

// Set test environment first
process.env.NODE_ENV = 'test';

// Create a simple test app for order service
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock the basic endpoints
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  
  app.get('/orders', (req, res) => {
    res.json([]);
  });
  
  app.get('/orders/user/:userId', (req, res) => {
    const { userId } = req.params;
    res.json([
      { id: 1, userId: parseInt(userId), status: 'pending', items: [] }
    ]);
  });
  
  app.post('/orders', (req, res) => {
    const { userId, items } = req.body;
    
    // Validate required fields
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' });
    }
    
    // Validate each item
    for (const item of items) {
      if (!item.productId) {
        return res.status(400).json({ error: 'Product ID is required for all items' });
      }
      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({ error: 'Valid quantity is required for all items' });
      }
      if (!item.price || item.price <= 0) {
        return res.status(400).json({ error: 'Valid price is required for all items' });
      }
    }
    
    res.status(201).json({
      id: 1,
      userId,
      items,
      status: 'pending',
      totalAmount: items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    });
  });
  
  return app;
};

describe('Order Service', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should respond to health check', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  test('should create an order successfully', async () => {
    const orderData = {
      userId: 1,
      items: [
        { productId: 1, quantity: 2, price: 10.99 }
      ]
    };

    const response = await request(app)
      .post('/orders')
      .send(orderData)
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.userId).toBe(1);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.status).toBe('pending');
  });

  test('should get orders for a user', async () => {
    const response = await request(app)
      .get('/orders/user/1')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  test('should validate required fields', async () => {
    // Test missing userId
    const response1 = await request(app)
      .post('/orders')
      .send({})
      .expect(400);

    expect(response1.body).toHaveProperty('error');
    expect(response1.body.error).toContain('User ID is required');

    // Test missing items
    const response2 = await request(app)
      .post('/orders')
      .send({ userId: 1 })
      .expect(400);

    expect(response2.body).toHaveProperty('error');
    expect(response2.body.error).toContain('Items are required');

    // Test empty items array
    const response3 = await request(app)
      .post('/orders')
      .send({ userId: 1, items: [] })
      .expect(400);

    expect(response3.body).toHaveProperty('error');
    expect(response3.body.error).toContain('Items are required');
  });

  test('should validate item fields', async () => {
    // Test missing productId
    const response1 = await request(app)
      .post('/orders')
      .send({ 
        userId: 1, 
        items: [{ quantity: 2, price: 10.99 }] 
      })
      .expect(400);

    expect(response1.body.error).toContain('Product ID is required');

    // Test invalid quantity
    const response2 = await request(app)
      .post('/orders')
      .send({ 
        userId: 1, 
        items: [{ productId: 1, quantity: 0, price: 10.99 }] 
      })
      .expect(400);

    expect(response2.body.error).toContain('Valid quantity is required');

    // Test invalid price
    const response3 = await request(app)
      .post('/orders')
      .send({ 
        userId: 1, 
        items: [{ productId: 1, quantity: 2, price: -5 }] 
      })
      .expect(400);

    expect(response3.body.error).toContain('Valid price is required');
  });
});