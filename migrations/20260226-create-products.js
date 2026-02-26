"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Use raw SQL with IF NOT EXISTS so migration is safe to run against existing DBs
    return queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DOUBLE PRECISION NOT NULL DEFAULT 0,
        stock INTEGER NOT NULL DEFAULT 0,
        reserved_stock INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
    `);
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS products CASCADE;
    `);
  }
};
