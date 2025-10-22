const request = require('supertest');
const app = require('../index');
const { Sequelize } = require('sequelize');

// Example Sequelize initialization
const sequelize = new Sequelize(
  process.env.DB_NAME,      // should be 'orders_db'
  process.env.DB_USER,      // should be 'orders_user'
  process.env.DB_PASSWORD,  // should be 'orders_password'
  {
    host: process.env.DB_HOST, // should be 'orders_db'
    dialect: 'postgres',
  }
);

describe('Order Service API', () => {
  it('GET /orders should return array', async () => {
    const res = await request(app).get('/orders');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});