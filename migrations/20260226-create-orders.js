"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Orders table
    await queryInterface.createTable('Orders', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'PENDING'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });

    // OrderItems table
    await queryInterface.createTable('OrderItems', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      OrderId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Orders',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      productId: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });

    // ProcessedEvents table
    await queryInterface.createTable('ProcessedEvents', {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false
      },
      eventType: {
        type: Sequelize.STRING,
        allowNull: false
      },
      processedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // DeadLetterEvents table
    await queryInterface.createTable('DeadLetterEvents', {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false
      },
      eventType: {
        type: Sequelize.STRING
      },
      payload: {
        type: Sequelize.JSON
      },
      errorMessage: {
        type: Sequelize.TEXT
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('DeadLetterEvents');
    await queryInterface.dropTable('ProcessedEvents');
    await queryInterface.dropTable('OrderItems');
    await queryInterface.dropTable('Orders');
  }
};
