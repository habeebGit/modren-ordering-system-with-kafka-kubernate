const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Sequelize, DataTypes, Op } = require('sequelize');
const winston = require('winston');

// Import metrics
const { register, metricsMiddleware, updateBusinessMetric } = require('../shared/monitoring/metrics');

// Import validation and middleware
const { validationResult, body, param, query } = require('express-validator');
const validationRules = require('./middleware/validation');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// Enhanced logging configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'order-service' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Database configuration with connection pooling
const sequelize = new Sequelize(
  process.env.DB_NAME || 'orders_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'password',
  {
    host: process.env.DB_HOST || 'orders_db',
    dialect: 'postgres',
    logging: (msg) => logger.debug(msg),
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Enhanced Order Model with optimistic locking
const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    validate: {
      notEmpty: true,
      isUUID: 4
    }
  },
  items: {
    type: DataTypes.JSONB,
    allowNull: false,
    validate: {
      notEmpty: true,
      isValidItems(value) {
        if (!Array.isArray(value) || value.length === 0) {
          throw new Error('Items must be a non-empty array');
        }
        value.forEach(item => {
          if (!item.productId || !item.quantity || !item.price) {
            throw new Error('Each item must have productId, quantity, and price');
          }
        });
      }
    },
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'shipped', 'delivered', 'cancelled'),
    defaultValue: 'pending'
  },
  shippingAddress: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
}, {
  tableName: 'orders',
  timestamps: true,
  indexes: [
    {
      fields: ['userId']
    },
    {
      fields: ['status']
    },
    {
      fields: ['createdAt']
    }
  ]
});

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3003'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests' }
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Add metrics middleware
app.use(metricsMiddleware);

// Authentication middleware (validates with auth service)
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      updateBusinessMetric('authenticationAttempts', 'inc', { result: 'failed', type: 'missing_token' });
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const token = authHeader.substring(7);
    
    // Validate with auth service
    const axios = require('axios');
    const response = await axios.post(`${process.env.AUTH_SERVICE_URL}/api/auth/validate`, {
      token
    }, { timeout: 5000 });

    if (response.data.success) {
      req.user = response.data.data.user;
      updateBusinessMetric('authenticationAttempts', 'inc', { result: 'success', type: 'token_validation' });
      next();
    } else {
      updateBusinessMetric('authenticationAttempts', 'inc', { result: 'failed', type: 'invalid_token' });
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    updateBusinessMetric('authenticationAttempts', 'inc', { result: 'error', type: 'service_error' });
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// Health check with detailed status
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await sequelize.authenticate();
    
    // Update database connections metric
    updateBusinessMetric('databaseConnections', 'set', { database: 'orders' }, sequelize.connectionManager.pool.size);
    
    res.json({
      success: true,
      message: 'Order service is healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      version: '1.0.0'
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      success: false,
      message: 'Service unhealthy',
      error: error.message
    });
  }
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end();
  }
});

// Create order with comprehensive validation and monitoring
app.post('/orders', 
  authMiddleware,
  validationRules.createOrder,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { items, shippingAddress } = req.body;
      
      // Calculate total amount
      const totalAmount = items.reduce((sum, item) => {
        return sum + (parseFloat(item.price) * parseInt(item.quantity));
      }, 0);

      // Create order with transaction
      const result = await sequelize.transaction(async (t) => {
        const order = await Order.create({
          userId: req.user.id,
          items,
          totalAmount,
          shippingAddress,
          status: 'pending'
        }, { transaction: t });

        // Update business metrics
        updateBusinessMetric('ordersCreated', 'inc', { 
          status: 'pending', 
          user_id: req.user.id 
        });
        updateBusinessMetric('revenue', 'inc', { currency: 'USD' }, totalAmount);

        // Publish order created event to Kafka
        await publishOrderEvent('order.created', {
          orderId: order.id,
          userId: order.userId,
          items: order.items,
          totalAmount: order.totalAmount,
          timestamp: new Date().toISOString()
        });

        return order;
      });

      logger.info('Order created:', { orderId: result.id, userId: req.user.id });

      res.status(201).json({
        success: true,
        message: 'Order created successfully',
        data: { order: result }
      });

    } catch (error) {
      logger.error('Create order error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create order'
      });
    }
  }
);

// Get orders with pagination and monitoring
app.get('/orders',
  authMiddleware,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const status = req.query.status;
      const offset = (page - 1) * limit;

      const whereClause = { userId: req.user.id };
      if (status) {
        whereClause.status = status;
      }

      const { count, rows } = await Order.findAndCountAll({
        where: whereClause,
        limit,
        offset,
        order: [['createdAt', 'DESC']],
        attributes: { exclude: ['version'] }
      });

      res.json({
        success: true,
        data: {
          orders: rows,
          pagination: {
            page,
            limit,
            total: count,
            totalPages: Math.ceil(count / limit)
          }
        }
      });

    } catch (error) {
      logger.error('Get orders error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch orders'
      });
    }
  }
);

// Kafka producer for event publishing
const kafka = require('kafkajs');

const kafkaClient = kafka({
  clientId: 'order-service',
  brokers: [process.env.KAFKA_BROKER || 'kafka:9092'],
  logLevel: kafka.logLevel.INFO
});

const producer = kafkaClient.producer({
  maxInFlightRequests: 1,
  idempotent: true,
  transactionTimeout: 30000
});

async function publishOrderEvent(eventType, data) {
  try {
    await producer.send({
      topic: 'order-events',
      messages: [
        {
          key: data.orderId.toString(),
          value: JSON.stringify({
            eventType,
            data,
            timestamp: new Date().toISOString()
          }),
          headers: {
            'event-type': eventType,
            'service': 'order-service'
          }
        }
      ]
    });

    updateBusinessMetric('kafkaMessages', 'inc', { 
      topic: 'order-events', 
      status: 'sent',
      consumer_group: 'order-service'
    });

    logger.info('Order event published:', { eventType, orderId: data.orderId });
  } catch (error) {
    logger.error('Failed to publish order event:', error);
    updateBusinessMetric('kafkaMessages', 'inc', { 
      topic: 'order-events', 
      status: 'failed',
      consumer_group: 'order-service'
    });
  }
}

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Graceful shutdown
async function gracefulShutdown() {
  try {
    logger.info('Shutting down gracefully...');
    await producer.disconnect();
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
async function startServer() {
  try {
    // Connect to database
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Sync database
    await sequelize.sync({ alter: true });
    logger.info('Database synchronized');

    // Connect Kafka producer
    await producer.connect();
    logger.info('Kafka producer connected');

    // Start server
    app.listen(PORT, () => {
      logger.info(`Order service running on port ${PORT}`);
    });

  } catch (error) {
    logger.error('Failed to start order service:', error);
    process.exit(1);
  }
}

startServer();

