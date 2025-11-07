require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const { Kafka } = require('kafkajs');
const axios = require('axios');
const cors = require('cors');
const app = express();
const port = 3002;

app.use(cors());
app.use(express.json());

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
    stock: { type: DataTypes.INTEGER, defaultValue: 0 },
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

app.get('/products', async (req, res) => {
  try {
    const products = await Product.findAll();
    
    // Calculate available stock (total - reserved)
    const productsWithAvailableStock = products.map(product => ({
      id: product.id,
      name: product.name,
      totalStock: product.stock,
      reservedStock: product.reservedStock,
      availableStock: product.stock - product.reservedStock,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    }));
    
    res.json(productsWithAvailableStock);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Error fetching products' });
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

// Stock reservation endpoint (replaces decrement-stock)
app.post('/reserve-stock', async (req, res) => {
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
                expiresAt: { [sequelize.Op.lt]: new Date() }
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
    await consumeOrderEvents();
    console.log('Kafka consumer started successfully');
  } catch (error) {
    console.error('Error starting Kafka consumer:', error);
    throw error;
  }
};

// Start service with cleanup job
const start = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully');
    
    await sequelize.sync({ alter: true });
    console.log('Database synced');

    await startKafkaConsumer();
    
    // Start cleanup job for expired reservations (only in production)
    if (process.env.NODE_ENV !== 'test') {
      setInterval(cleanupExpiredReservations, 5 * 60 * 1000); // Every 5 minutes
      app.listen(port, () => console.log(`Product Service running on port ${port}`));
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

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

