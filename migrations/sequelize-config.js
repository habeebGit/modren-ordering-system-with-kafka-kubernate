'use strict';

module.exports = {
  production: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'products_db',
    host: process.env.DB_HOST || 'products_db',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    dialect: 'postgres',
    define: {
      underscored: true,
      timestamps: true
    },
    logging: false
  }
};