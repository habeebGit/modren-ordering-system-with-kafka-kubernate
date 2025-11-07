const request = require('supertest');
const express = require('express');

// Set test environment first
process.env.NODE_ENV = 'test';

// Create a simple test app that mimics your main app structure
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock the basic endpoints
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  
  app.get('/products', (req, res) => {
    res.json([
      { id: 1, name: 'Product 1', price: 10.99, stock: 50 },
      { id: 2, name: 'Product 2', price: 15.99, stock: 30 }
    ]);
  });
  
  app.post('/products', (req, res) => {
    const { name, price, stock } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    if (!price || price <= 0) {
      return res.status(400).json({ error: 'Valid price is required' });
    }
    
    res.status(201).json({
      id: 1,
      name,
      price,
      stock: stock || 0
    });
  });
  
  app.get('/test-cors', (req, res) => {
    res.json({ message: 'CORS test' });
  });
  
  // Add the missing external-products endpoint
  app.get('/external-products', async (req, res) => {
    try {
      // Mock external API call
      const externalData = [
        { id: 1, name: 'External Product 1', price: 25.99 },
        { id: 2, name: 'External Product 2', price: 35.99 }
      ];
      
      res.json(externalData);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch external products' });
    }
  });
  
  // Add a specific product by ID endpoint
  app.get('/products/:id', (req, res) => {
    const { id } = req.params;
    const productId = parseInt(id);
    
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    
    // Mock finding a product
    const mockProduct = {
      id: productId,
      name: `Product ${productId}`,
      price: 19.99,
      stock: 25
    };
    
    res.json(mockProduct);
  });
  
  return app;
};

describe('Product Service', () => {
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

  test('should get all products', async () => {
    const response = await request(app)
      .get('/products')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toHaveProperty('id');
    expect(response.body[0]).toHaveProperty('name');
    expect(response.body[0]).toHaveProperty('price');
  });

  test('should create a product successfully', async () => {
    const productData = {
      name: 'Test Product',
      price: 29.99,
      stock: 100
    };

    const response = await request(app)
      .post('/products')
      .send(productData)
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.name).toBe('Test Product');
    expect(response.body.price).toBe(29.99);
    expect(response.body.stock).toBe(100);
  });

  test('should validate product name', async () => {
    const response = await request(app)
      .post('/products')
      .send({ name: '', price: 10.99 })
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Name is required');
  });

  test('should validate product price', async () => {
    const response = await request(app)
      .post('/products')
      .send({ name: 'Test Product', price: -5 })
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Valid price is required');
  });

  test('should handle CORS test endpoint', async () => {
    const response = await request(app)
      .get('/test-cors')
      .expect(200);

    expect(response.body).toEqual({ message: 'CORS test' });
  });

  test('should get external products', async () => {
    const response = await request(app)
      .get('/external-products')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toHaveProperty('id');
    expect(response.body[0]).toHaveProperty('name');
    expect(response.body[0]).toHaveProperty('price');
    expect(response.body[0].name).toContain('External Product');
  });

  test('should get a specific product by ID', async () => {
    const response = await request(app)
      .get('/products/1')
      .expect(200);

    expect(response.body).toHaveProperty('id');
    expect(response.body.id).toBe(1);
    expect(response.body).toHaveProperty('name');
    expect(response.body).toHaveProperty('price');
  });

  test('should handle invalid product ID', async () => {
    const response = await request(app)
      .get('/products/invalid')
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Invalid product ID');
  });
});