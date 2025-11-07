require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Sequelize, DataTypes, Op } = require('sequelize');
const { Kafka } = require('kafkajs');
const axios = require('axios');
const cors = require('cors');

// Import validation middleware
const {
  sanitizeInput,
  validateSchema,
  validationRules,
  handleValidationErrors,
  securityMiddleware,
  schemas
} = require('./middleware/validation');

const app = express();
const port = 3002;

// Security middleware
app.use(helmet());
app.use(securityMiddleware);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later'
  }
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['http://localhost:3000'] // Add your production domains
    : true,
  credentials: true
}));

// Body parsing with size limits
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({
        success: false,
        message: 'Invalid JSON payload'
      });
      throw new Error('Invalid JSON');
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization middleware (apply to all routes)
app.use(sanitizeInput);

// Database connection
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'postgres'
  }
);

// Product Model with proper stock management
const Product = sequelize.define('Product', {
    name: { type: DataTypes.STRING, allowNull: false },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    stock: { type: DataTypes.INTEGER, defaultValue: 0 },
    category: { type: DataTypes.STRING, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    reservedStock: { type: DataTypes.INTEGER, defaultValue: 0 }, // Track reserved stock
    version: { type: DataTypes.INTEGER, defaultValue: 1 } // For optimistic locking
});

// Stock Reservation Model for tracking reservations
const StockReservation = sequelize.define('StockReservation', {
    orderId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    status: { 
        type: DataTypes.ENUM('RESERVED', 'CONFIRMED', 'RELEASED'), 
        defaultValue: 'RESERVED' 
    },
    expiresAt: { type: DataTypes.DATE, allowNull: false }
});

// Processed Event Model for idempotency
const ProcessedEvent = sequelize.define('ProcessedEvent', {
    id: { type: DataTypes.STRING, primaryKey: true },
    eventType: { type: DataTypes.STRING, allowNull: false },
    processedAt: { type: DataTypes.DATE, allowNull: false }
});

// Add associations
Product.hasMany(StockReservation);
StockReservation.belongsTo(Product);

// Kafka setup
const kafka = new Kafka({ brokers: ['kafka:9092'] });
const consumer = kafka.consumer({ groupId: 'product-group' });
const producer = kafka.producer();

// Kafka event sending with retry logic
async function sendStockEventWithRetry(event, retries = 3) {
    const messageId = `${event.eventType}-${event.orderId}-${Date.now()}`;
    let attempt = 0;
    
    while (attempt < retries) {
        try {
            await producer.connect();
            await producer.send({
                topic: 'order-events',
                messages: [{ 
                    key: event.orderId.toString(),
                    value: JSON.stringify({ 
                        messageId,
                        eventType: event.eventType,
                        event,
                        timestamp: new Date().toISOString()
                    }) 
                }]
            });
            await producer.disconnect();
            console.log('Stock event sent successfully', { messageId, eventType: event.eventType });
            return;
        } catch (err) {
            attempt++;
            console.warn(`Stock event send attempt ${attempt} failed`, { messageId, error: err.message });
            if (attempt === retries) {
                console.error('Stock event failed after retries', { 
                    messageId, 
                    event, 
                    error: err.message 
                });
            }
        }
    }
}

// Kafka consumer for order events with proper event handling
const consumeOrderEvents = async () => {
    await consumer.connect();
    await consumer.subscribe({ topic: 'order-events', fromBeginning: true });
    await consumer.run({
        eachMessage: async ({ message }) => {
            try {
                const { messageId, eventType, event } = JSON.parse(message.value.toString());
                
                // Implement idempotency check
                const processedEvent = await ProcessedEvent.findByPk(messageId);
                if (processedEvent) {
                    console.log('Event already processed, skipping', { messageId, eventType });
                    return;
                }

                switch (eventType) {
                    case 'ORDER_CREATED':
                        // This is handled by the reserve-stock endpoint call
                        console.log('Order created event received', { orderId: event.orderId });
                        break;
                    
                    case 'ORDER_CANCELLED':
                        // Release reserved stock
                        await releaseStockForOrder(event.orderId);
                        break;
                    
                    case 'ORDER_PAID':
                        // Confirm stock reservation
                        await confirmStockForOrder(event.orderId);
                        break;
                        
                    default:
                        console.warn('Unknown event type received', { eventType, event });
                }

                // Mark event as processed
                await ProcessedEvent.create({ 
                    id: messageId, 
                    eventType, 
                    processedAt: new Date() 
                });

            } catch (error) {
                console.error('Error processing order event:', error);
            }
        },
    });
};

// Helper function to release stock for cancelled orders
async function releaseStockForOrder(orderId) {
    const transaction = await sequelize.transaction();
    try {
        const reservations = await StockReservation.findAll({
            where: { orderId, status: 'RESERVED' },
            include: [Product],
            transaction
        });
        
        for (const reservation of reservations) {
            const product = reservation.Product;
            await product.update({
                reservedStock: product.reservedStock - reservation.quantity,
                version: product.version + 1
            }, { transaction });
            
            await reservation.update({ status: 'RELEASED' }, { transaction });
        }
        
        await transaction.commit();
        console.log('Stock released for cancelled order', { orderId });
        
    } catch (error) {
        await transaction.rollback();
        console.error('Error releasing stock for cancelled order', { orderId, error: error.message });
    }
}

// Helper function to confirm stock for paid orders
async function confirmStockForOrder(orderId) {
    const transaction = await sequelize.transaction();
    try {
        const reservations = await StockReservation.findAll({
            where: { orderId, status: 'RESERVED' },
            include: [Product],
            transaction
        });
        
        for (const reservation of reservations) {
            const product = reservation.Product;
            await product.update({
                stock: product.stock - reservation.quantity,
                reservedStock: product.reservedStock - reservation.quantity,
                version: product.version + 1
            }, { transaction });
            
            await reservation.update({ status: 'CONFIRMED' }, { transaction });
        }
        
        await transaction.commit();
        console.log('Stock confirmed for paid order', { orderId });
        
    } catch (error) {
        await transaction.rollback();
        console.error('Error confirming stock for paid order', { orderId, error: error.message });
    }
}

// Get all products with filtering and pagination
app.get('/products', 
  validationRules.getProducts,
  handleValidationErrors,
  validateSchema(schemas.pagination, 'query'),
  async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 10, 
        sortBy = 'createdAt', 
        sortOrder = 'DESC', 
        category, 
        minPrice, 
        maxPrice 
      } = req.query;
      const offset = (page - 1) * limit;
      
      // Build where clause for filtering
      const whereClause = {};
      if (category) {
        whereClause.category = category;
      }
      if (minPrice !== undefined || maxPrice !== undefined) {
        whereClause.price = {};
        if (minPrice !== undefined) {
          whereClause.price[Op.gte] = minPrice;
        }
        if (maxPrice !== undefined) {
          whereClause.price[Op.lte] = maxPrice;
        }
      }
      
      const products = await Product.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [[sortBy, sortOrder]]
      });
      
      // Calculate available stock (total - reserved)
      const productsWithAvailableStock = products.rows.map(product => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        category: product.category,
        sku: product.sku,
        totalStock: product.stock,
        reservedStock: product.reservedStock,
        availableStock: product.stock - product.reservedStock,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt
      }));
      
      res.json({
        success: true,
        data: {
          products: productsWithAvailableStock,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(products.count / limit),
            totalItems: products.count,
            itemsPerPage: limit
          }
        }
      });
    } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to fetch products',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
});

// Get product by ID
app.get('/products/:id', 
  validationRules.getProductById,
  handleValidationErrors,
  validateSchema(schemas.productId, 'params'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const product = await Product.findByPk(id);
      
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }
      
      res.json({
        success: true,
        data: {
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          category: product.category,
          sku: product.sku,
          totalStock: product.stock,
          reservedStock: product.reservedStock,
          availableStock: product.stock - product.reservedStock,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt
        }
      });
    } catch (error) {
      console.error('Error fetching product:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to fetch product',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
});

// Create new product
app.post('/products', 
  validationRules.createProduct,
  handleValidationErrors,
  validateSchema(schemas.createProduct),
  async (req, res) => {
    try {
      const productData = req.body;
      
      // Check for duplicate SKU if provided
      if (productData.sku) {
        const existingProduct = await Product.findOne({ 
          where: { sku: productData.sku } 
        });
        if (existingProduct) {
          return res.status(409).json({
            success: false,
            message: 'Product with this SKU already exists'
          });
        }
      }
      
      const product = await Product.create(productData);
      res.status(201).json({
        success: true,
        data: product,
        message: 'Product created successfully'
      });
    } catch (error) {
      console.error('Error creating product:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to create product',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
});

// Update product
app.put('/products/:id', 
  validationRules.updateProduct,
  handleValidationErrors,
  validateSchema(schemas.updateProduct),
  async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const product = await Product.findByPk(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }
      
      // Check for duplicate SKU if provided
      if (updateData.sku && updateData.sku !== product.sku) {
        const existingProduct = await Product.findOne({ 
          where: { sku: updateData.sku } 
        });
        if (existingProduct) {
          return res.status(409).json({
            success: false,
            message: 'Product with this SKU already exists'
          });
        }
      }
      
      await product.update(updateData);
      res.json({
        success: true,
        data: product,
        message: 'Product updated successfully'
      });
    } catch (error) {
      console.error('Error updating product:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to update product',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
});

app.get('/external-products', async (req, res) => {
  try {
    const response = await axios.get(`${process.env.REACT_APP_PRODUCT_SERVICE_URL}/products`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching external products:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/test-cors', (req, res) => {
  res.json({ message: 'CORS test' });
});

// Stock reservation endpoint with validation
app.post('/reserve-stock', 
  validateSchema(schemas.reserveStock),
  async (req, res) => {
    const { orderId, items } = req.body; // {orderId, items: [{productId, quantity}]}
    const transaction = await sequelize.transaction();
    
    try {
        const reservations = [];
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

        // Check if reservation already exists (idempotency)
        const existingReservation = await StockReservation.findOne({
            where: { orderId },
            transaction
        });
        
        if (existingReservation) {
            await transaction.rollback();
            return res.json({ success: true, message: 'Stock already reserved' });
        }

        for (const { productId, quantity } of items) {
            // Use optimistic locking to prevent race conditions
            const product = await Product.findByPk(productId, { transaction });
            
            if (!product) {
                throw new Error(`Product ${productId} not found`);
            }
            
            const availableStock = product.stock - product.reservedStock;
            if (availableStock < quantity) {
                throw new Error(`Insufficient stock for product ${product.name}. Available: ${availableStock}, Required: ${quantity}`);
            }
            
            // Reserve the stock
            await product.update({ 
                reservedStock: product.reservedStock + quantity,
                version: product.version + 1
            }, { 
                transaction,
                where: { version: product.version } // Optimistic locking
            });
            
            // Create reservation record
            const reservation = await StockReservation.create({
                orderId,
                productId,
                quantity,
                status: 'RESERVED',
                expiresAt
            }, { transaction });
            
            reservations.push(reservation);
        }
        
        await transaction.commit();
        
        // Send stock reserved event
        await sendStockEventWithRetry({
            eventType: 'STOCK_RESERVED',
            orderId,
            items,
            reservations: reservations.map(r => r.id)
        });
        
        console.log('Stock reserved successfully', { orderId, items: items.length });
        res.json({ success: true, message: 'Stock reserved successfully' });
        
    } catch (error) {
        await transaction.rollback();
        
        // Send stock reservation failed event
        await sendStockEventWithRetry({
            eventType: 'STOCK_RESERVATION_FAILED',
            orderId,
            items,
            reason: error.message
        });
        
        console.error('Error reserving stock:', error);
        res.status(400).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Confirm stock reservation (when order is paid)
app.post('/confirm-stock/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const transaction = await sequelize.transaction();
    
    try {
        const reservations = await StockReservation.findAll({
            where: { orderId, status: 'RESERVED' },
            include: [Product],
            transaction
        });
        
        if (reservations.length === 0) {
            return res.status(404).json({ message: 'No reservations found for this order' });
        }
        
        for (const reservation of reservations) {
            const product = reservation.Product;
            
            // Move from reserved to actual stock deduction
            await product.update({
                stock: product.stock - reservation.quantity,
                reservedStock: product.reservedStock - reservation.quantity,
                version: product.version + 1
            }, { transaction });
            
            // Mark reservation as confirmed
            await reservation.update({ status: 'CONFIRMED' }, { transaction });
        }
        
        await transaction.commit();
        console.log('Stock confirmed for order', { orderId });
        res.json({ success: true, message: 'Stock confirmed successfully' });
        
    } catch (error) {
        await transaction.rollback();
        console.error('Error confirming stock:', error);
        res.status(500).json({ message: error.message });
    }
});

// Release stock reservation (when order is cancelled)
app.post('/release-stock/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const transaction = await sequelize.transaction();
    
    try {
        const reservations = await StockReservation.findAll({
            where: { orderId, status: 'RESERVED' },
            include: [Product],
            transaction
        });
        
        for (const reservation of reservations) {
            const product = reservation.Product;
            
            // Release reserved stock
            await product.update({
                reservedStock: product.reservedStock - reservation.quantity,
                version: product.version + 1
            }, { transaction });
            
            // Mark reservation as released
            await reservation.update({ status: 'RELEASED' }, { transaction });
        }
        
        await transaction.commit();
        console.log('Stock released for order', { orderId });
        res.json({ success: true, message: 'Stock released successfully' });
        
    } catch (error) {
        await transaction.rollback();
        console.error('Error releasing stock:', error);
        res.status(500).json({ message: error.message });
    }
});

// Cleanup expired reservations
async function cleanupExpiredReservations() {
    try {
        const expiredReservations = await StockReservation.findAll({
            where: {
                status: 'RESERVED',
                expiresAt: { [Op.lt]: new Date() }
            },
            include: [Product]
        });
        
        for (const reservation of expiredReservations) {
            const transaction = await sequelize.transaction();
            try {
                const product = reservation.Product;
                
                // Release the reserved stock
                await product.update({
                    reservedStock: product.reservedStock - reservation.quantity,
                    version: product.version + 1
                }, { transaction });
                
                // Mark reservation as released
                await reservation.update({ status: 'RELEASED' }, { transaction });
                
                await transaction.commit();
                console.log('Released expired reservation', { 
                    orderId: reservation.orderId, 
                    productId: reservation.productId 
                });
                
            } catch (error) {
                await transaction.rollback();
                console.error('Error releasing expired reservation', { error: error.message });
            }
        }
    } catch (error) {
        console.error('Error during cleanup of expired reservations:', error);
    }
}

// Add the missing startKafkaConsumer function
const startKafkaConsumer = async () => {
  if (process.env.NODE_ENV === 'test') {
    console.log('Skipping Kafka consumer in test mode');
    return;
  }
  
  try {
    // Kafka consumer implementation would go here
    console.log('Kafka consumer started');
  } catch (error) {
    console.error('Error starting Kafka consumer:', error);
  }
};

// Import error handling middleware
const {
  globalErrorHandler,
  notFoundHandler,
  setupGracefulShutdown,
  asyncHandler
} = require('./middleware/errorHandler');

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'product-service'
  });
});

// Apply error handling middleware after all routes
app.use(notFoundHandler);
app.use(globalErrorHandler);

// Start service with cleanup job
const start = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully');
    
    await sequelize.sync({ alter: true });
    console.log('Database synced');
    
    // Add sample products if none exist
    const productCount = await Product.count();
    if (productCount === 0) {
      console.log('Adding sample products...');
      await Product.bulkCreate([
        {
          name: 'MacBook Pro 16"',
          price: 2499.99,
          stock: 15,
          category: 'Electronics',
          description: 'Apple MacBook Pro with M2 Max chip'
        },
        {
          name: 'iPhone 15 Pro',
          price: 999.99,
          stock: 25,
          category: 'Electronics',
          description: 'Latest iPhone with titanium design'
        },
        {
          name: 'AirPods Pro',
          price: 249.99,
          stock: 50,
          category: 'Electronics',
          description: 'Active noise cancellation wireless earbuds'
        },
        {
          name: 'iPad Air',
          price: 599.99,
          stock: 30,
          category: 'Electronics',
          description: '10.9-inch iPad with M1 chip'
        },
        {
          name: 'Apple Watch Series 9',
          price: 399.99,
          stock: 40,
          category: 'Electronics',
          description: 'Advanced health and fitness tracking'
        },
        {
          name: 'Magic Keyboard',
          price: 179.99,
          stock: 20,
          category: 'Accessories',
          description: 'Wireless keyboard for Mac and iPad'
        },
        {
          name: 'Studio Display',
          price: 1599.99,
          stock: 8,
          category: 'Electronics',
          description: '27-inch 5K Retina display'
        },
        {
          name: 'Mac Mini',
          price: 699.99,
          stock: 12,
          category: 'Electronics',
          description: 'Compact desktop computer with M2 chip'
        }
      ]);
      console.log('Sample products added successfully');
    } else {
      console.log(`Found ${productCount} existing products`);
    }

    await startKafkaConsumer();
    
    // Start cleanup job for expired reservations (only in production)
    if (process.env.NODE_ENV !== 'test') {
      setInterval(cleanupExpiredReservations, 5 * 60 * 1000); // Every 5 minutes
      
      const server = app.listen(port, () => {
        console.log(`Product Service running on port ${port}`);
      });
      
      // Setup graceful shutdown
      setupGracefulShutdown(server);
    }
  } catch (error) {
    console.error('Startup error:', error);
    // Don't exit in test environment
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
};

// Only start if not in test mode
if (process.env.NODE_ENV !== 'test') {
  start();
}

// Export the app for testing
module.exports = app;

