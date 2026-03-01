"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("stock_reservations", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "reserved"
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW")
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW")
      }
    });

    await queryInterface.addIndex("stock_reservations", ["order_id"]);
    await queryInterface.addIndex("stock_reservations", ["product_id"]);
  },

  async down(queryInterface /*, Sequelize */) {
    await queryInterface.dropTable("stock_reservations");
  }
};