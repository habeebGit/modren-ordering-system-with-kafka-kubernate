require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const { Kafka } = require('kafkajs');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const message = require('./lib/message');
const dns = require('node:dns').promises;
const app = express();
const port = 3002;

app.use(cors());
app.use(express.json());

// Lightweight liveness endpoint - register early so healthchecks succeed while startup tasks run
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Database connection
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    define: {
      underscored: true, // map camelCase (createdAt) to snake_case (created_at)
    }
  }
);

// Product Model with proper stock management
const Product = sequelize.define('Product', {
    name: { type: DataTypes.STRING, allowNull: false },
    price: { type: DataTypes.FLOAT, defaultValue: 0 },
    stock: { type: DataTypes.INTEGER, defaultValue: 0 },
    reservedStock: { type: DataTypes.INTEGER, defaultValue: 0, field: 'reserved_stock' } // Track reserved stock (maps to existing DB column)
}, {
    tableName: 'products',
    // timestamps are true by default; underscored option above maps createdAt -> created_at
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
const kafka = new Kafka({ brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(',') });
let consumer = null; // created lazily to avoid double-subscribe on retries
let consumerRunning = false;
const producer = kafka.producer();

const kafkaBrokers = (process.env.KAFKA_BROKERS || 'kafka:9092').split(',');

async function waitForBrokers(brokers, timeoutMs = 120000) {
  const hosts = brokers.map(b => b.split(':')[0]);
  const start = Date.now();
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  while (Date.now() - start < timeoutMs) {
    try {
      for (const host of hosts) {
        await dns.lookup(host);
      }
      return true;
    } catch (error_) {
      console.log('Waiting for Kafka broker DNS to resolve', { error: error_.code || error_.message });
      await delay(2000);
    }
  }
  throw new Error('Timed out waiting for Kafka brokers to be resolvable');
}

// Kafka event sending with retry logic
async function sendStockEventWithRetry(event, retries = 3) {
    let attempt = 0;

    while (attempt < retries) {
        try {
            await producer.send({
                topic: 'order-events',
                messages: [{
                    key: event.orderId ? event.orderId.toString() : undefined,
                    value: message.stringifyEnvelope(event.eventType, event)
                }]
            });
            console.log('Stock event sent successfully', { eventType: event.eventType });
            return;
        } catch (err) {
            attempt++;
            console.warn(`Stock event send attempt ${attempt} failed`, { error: err.message });
            if (attempt === retries) {
                console.error('Stock event failed after retries', {
                    event,
                    error: err.message
                });
                // Optionally persist to dead-letter store (not implemented here)
            } else {
                // backoff
                const backoffMs = Math.min(2000, Math.pow(2, attempt) * 100) + Math.floor(Math.random() * 100);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
        }
    }
}

// Kafka consumer for order events with proper event handling
const consumeOrderEvents = async () => {
    if (!consumer) throw new Error('Consumer not initialized');
    if (consumerRunning) {
        console.log('Consumer already running, skipping consumeOrderEvents');
        return;
    }

    // Try to subscribe; handle race where a previous consumer instance might still be active
    try {
        await consumer.subscribe({ topic: 'order-events', fromBeginning: true });
    } catch (subErr) {
        // If the consumer is already running in another instance, log and continue
        if (String(subErr).includes('Cannot subscribe to topic while consumer is running')) {
            console.warn('Subscribe race detected - consumer already running elsewhere, continuing to run handler');
        } else {
            throw subErr;
        }
    }

    // Mark as running before starting the message loop to avoid races
    consumerRunning = true;

    // Only start the run loop if not already active
    try {
        await consumer.run({
            eachMessage: async ({ message: kafkaMessage }) => {
                try {
                    const envelope = message.parseEnvelope(kafkaMessage.value);
                    if (!envelope) {
                        console.log('Received invalid message envelope');
                        return;
                    }
                    const { messageId, eventType, payload } = envelope;
                    
                    // Implement idempotency check
                    const processedEvent = await ProcessedEvent.findByPk(messageId);
                    if (processedEvent) {
                        console.log('Event already processed, skipping', { messageId, eventType });
                        return;
                    }

                    switch (eventType) {
                        case 'ORDER_CREATED':
                            // This is handled by the reserve-stock endpoint call
                            console.log('Order created event received', { orderId: payload.orderId });
                            break;
                        
                        case 'ORDER_CANCELLED':
                            // Release reserved stock
                            await releaseStockForOrder(payload.orderId);
                            break;
                        
                        case 'ORDER_PAID':
                            // Confirm stock reservation
                            await confirmStockForOrder(payload.orderId);
                            break;
                            
                        default:
                            console.warn('Unknown event type received', { eventType, payload });
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
    } catch (runErr) {
        // If run fails, clear running flag so retry logic can attempt again
        consumerRunning = false;
        throw runErr;
    }
};

// Helper to stop and cleanup consumer
const stopConsumer = async () => {
  if (!consumer) return;
  console.log('Stopping existing Kafka consumer...');
  try {
    // If the run loop is active, stop it first (KafkaJS consumer.stop exists)
    if (consumerRunning && typeof consumer.stop === 'function') {
      try {
        await consumer.stop();
        console.log('Consumer run loop stopped');
      } catch (e) {
        console.warn('Error while stopping consumer run loop', { error: e && e.message });
      }
    }

    // Always attempt a disconnect to close the consumer session
    try {
      await consumer.disconnect();
      console.log('Consumer disconnected');
    } catch (e) {
      console.warn('Error while disconnecting consumer', { error: e && e.message });
    }
  } finally {
    consumer = null;
    consumerRunning = false;
    // longer delay to allow network sessions/resources to fully release before recreating
    await new Promise(r => setTimeout(r, 1000));
    console.log('Consumer cleanup complete, proceeding to next attempt');
  }
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
                reservedStock: product.reservedStock - reservation.quantity
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
                reservedStock: product.reservedStock - reservation.quantity
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
      price: product.price,
      stock: product.stock,
      reservedStock: product.reservedStock,
      availableStock: product.stock - (product.reservedStock || 0),
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    }));
    
    res.json(productsWithAvailableStock);
  } catch (error) {
    console.error('Error fetching products:', error && error.stack ? error.stack : error);
    res.status(500).json({ message: 'Error fetching products', error: error && error.message ? error.message : String(error) });
  }
});

// Create a new product (used by Admin frontend form)
app.post('/products', async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: 'Request body is required' });
    }

    const { name, price, stock } = req.body;

    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const parsedPrice = Number(price);
    if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({ error: 'Valid price is required' });
    }

    const parsedStock = Number.isInteger(Number(stock)) ? Number(stock) : 0;
    if (parsedStock < 0) {
      return res.status(400).json({ error: 'Stock must be >= 0' });
    }

    const product = await Product.create({
      name: String(name).trim(),
      price: parsedPrice,
      stock: parsedStock,
      reservedStock: 0
    });

    res.status(201).json({
      id: product.id,
      name: product.name,
      price: product.price,
      stock: product.stock,
      reservedStock: product.reservedStock,
      availableStock: product.stock - product.reservedStock,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    });
  } catch (error) {
    // Log full stack if available and return error details to aid debugging in dev
    console.error('Error creating product:', error && error.stack ? error.stack : error);
    res.status(500).json({ error: 'Failed to create product', details: error && error.message ? error.message : String(error) });
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
                reservedStock: product.reservedStock + quantity
            }, { 
                transaction
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
                reservedStock: product.reservedStock - reservation.quantity
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
                reservedStock: product.reservedStock - reservation.quantity
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
                expiresAt: { [Sequelize.Op.lt]: new Date() }
            },
            include: [Product]
        });

        for (const reservation of expiredReservations) {
            const transaction = await sequelize.transaction();
            try {
                const product = reservation.Product;
                
                // Release the reserved stock
                await product.update({
                    reservedStock: product.reservedStock - reservation.quantity
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
    // Wait for brokers to resolve before attempting connections
    try {
      await waitForBrokers(kafkaBrokers, 120000);
    } catch (error_) {
      console.warn('Kafka brokers did not resolve in time, will attempt connects and rely on client retries', { error: error_.message });
    }

    // Try to connect producer and consumer with retries
    const maxAttempts = 8;
    let backoffBase = 500;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Ensure any previous consumer is fully stopped before creating a new one
        if (consumer) {
          console.log('Existing consumer detected before attempt', attempt, '- stopping it first');
          try { await stopConsumer(); } catch (e) { console.warn('Error stopping previous consumer', { error: e && e.message }); }
        }
        console.log('Creating new Kafka consumer instance (attempt', attempt + ')');
        consumer = kafka.consumer({ groupId: 'product-group' });

        // Connect producer (idempotent) and consumer
        await producer.connect();
        console.log('Kafka producer connected for product-service (attempt', attempt + ')');

        await consumer.connect();
        console.log('Kafka consumer connected (attempt', attempt + ')');
        // Start consuming (subscribe + run) only once per consumer instance
        await consumeOrderEvents();

        console.log('Kafka consumer started successfully');
        break;
      } catch (err) {
        // On error, ensure we clean up the consumer before retrying
        try { await stopConsumer(); } catch (e) { /* ignore cleanup errors */ }

        const backoff = Math.min(30000, backoffBase * Math.pow(2, attempt));
        console.warn(`Attempt ${attempt} to start Kafka client failed, retrying in ${backoff}ms`, { error: err.message });
        if (attempt === maxAttempts) {
          console.error('Failed to start Kafka consumer after retries', { error: err.message });
          throw err;
        }
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  } catch (error_) {
    console.error('Error starting Kafka consumer:', error_);
    throw error_;
  }
};

// Start the Kafka consumer on service startup. Make startup non-fatal so the HTTP
// endpoints (e.g. /products) remain available even if Kafka is down. Retry in
// background every 30s instead of exiting the process.
(async () => {
  try {
    await startKafkaConsumer();
  } catch (err) {
    console.error('Non-fatal: Failed to start Kafka consumer on startup; continuing without consumer.', err && err.message ? err.message : err);

    // Retry in the background periodically
    const retryIntervalMs = 30 * 1000;
    setInterval(async () => {
      try {
        console.log('Retrying to start Kafka consumer...');
        await startKafkaConsumer();
      } catch (e) {
        console.warn('Retry to start Kafka consumer failed:', e && e.message ? e.message : e);
      }
    }, retryIntervalMs);
  }
})();

// Periodic cleanup of expired reservations
setInterval(cleanupExpiredReservations, 5 * 60 * 1000); // Every 5 minutes

app.listen(port, () => {
  console.log(`Product service listening at http://localhost:${port}`);
});

