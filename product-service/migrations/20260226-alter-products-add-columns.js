"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add missing columns safely if they don't exist
    return queryInterface.sequelize.query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS reserved_stock INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS price DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
    `);
  },

  async down(queryInterface, Sequelize) {
    // Remove the added columns if present
    return queryInterface.sequelize.query(`
      ALTER TABLE products
        DROP COLUMN IF EXISTS reserved_stock,
        DROP COLUMN IF EXISTS price,
        DROP COLUMN IF EXISTS created_at,
        DROP COLUMN IF EXISTS updated_at;
    `);
  }
};
