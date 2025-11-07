const request = require('supertest');
const app = require('../app');

describe('Frontend App', () => {
  test('should respond to health check', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({ 
      status: 'ok', 
      service: 'frontend' 
    });
  });

  test('should handle API test endpoint', async () => {
    const response = await request(app)
      .get('/api/test')
      .expect(200);

    expect(response.body).toEqual({ 
      message: 'Frontend API test successful' 
    });
  });

  test('should serve static files for React routes', async () => {
    // Mock the static file serving
    const response = await request(app)
      .get('/dashboard')
      .expect(200);

    // Since we're mocking the static file serving, 
    // we just check that the route is handled
  });
});