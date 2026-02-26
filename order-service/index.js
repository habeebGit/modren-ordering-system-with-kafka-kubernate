require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');
const { Kafka } = require('kafkajs');
const axios = require('axios');
const winston = require('winston');
const morgan = require('morgan');
const client = require('prom-client');
const message = require('./lib/message');
const dns = require('dns').promises;

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Winston logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Morgan HTTP request logging, integrated with Winston
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

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

// Order Model
const Order = sequelize.define('Order', {
    userId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'Pending' }
});

// Order Item Model
const OrderItem = sequelize.define('OrderItem', {
    productId: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false }
});
Order.hasMany(OrderItem, { as: 'items' });
OrderItem.belongsTo(Order);

// Processed Event Model for idempotency
const ProcessedEvent = sequelize.define('ProcessedEvent', {
    id: { type: DataTypes.STRING, primaryKey: true },
    eventType: { type: DataTypes.STRING, allowNull: false },
    processedAt: { type: DataTypes.DATE, allowNull: false }
});

// Dead Letter Event Model to persist failed events
const DeadLetterEvent = sequelize.define('DeadLetterEvent', {
    id: { type: DataTypes.STRING, primaryKey: true },
    eventType: { type: DataTypes.STRING },
    payload: { type: DataTypes.JSON },
    errorMessage: { type: DataTypes.TEXT },
    createdAt: { type: DataTypes.DATE, defaultValue: Sequelize.NOW }
});

// Kafka setup
const kafkaBrokers = (process.env.KAFKA_BROKERS || 'kafka:9092').split(',');
const kafka = new Kafka({ brokers: kafkaBrokers });
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'order-service-group' });

// Create a Registry to register the metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Example custom metric
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
});
register.registerMetric(httpRequestCounter);

// Increment counter on each request
app.use((req, res, next) => {
  httpRequestCounter.inc();
  next();
});

// Order creation endpoint with proper transaction handling
app.post('/orders', async (req, res) => {
    const { userId, items } = req.body;
    if (!userId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Invalid order payload." });
    }

    const transaction = await sequelize.transaction();
    try {
        // Step 1: Create order in PENDING status first
        const order = await Order.create({ 
            userId, 
            status: 'PENDING' 
        }, { transaction });

        // Step 2: Create order items
        const orderItems = await Promise.all(
            items.map(item => 
                OrderItem.create({ 
                    OrderId: order.id, 
                    productId: item.productId,
                    quantity: item.quantity 
                }, { transaction })
            )
        );

        // Step 3: Send reservation request to product service (not immediate decrement)
        const reservationRes = await axios.post(
            process.env.PRODUCT_SERVICE_URL + '/reserve-stock',
            { 
                orderId: order.id,
                items: items.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity
                }))
            }
        );

        if (!reservationRes.data.success) {
            throw new Error(reservationRes.data.message || "Stock reservation failed");
        }

        // Step 4: Update order status to CONFIRMED
        await order.update({ status: 'CONFIRMED' }, { transaction });

        // Step 5: Commit transaction
        await transaction.commit();

        logger.info('Order created successfully', { 
            orderId: order.id, 
            userId, 
            items: items.length 
        });

        // Step 6: Send order created event (async, after transaction commit)
        setImmediate(async () => {
            await sendOrderEventWithRetry({ 
                orderId: order.id, 
                userId, 
                items,
                eventType: 'ORDER_CREATED',
                timestamp: new Date().toISOString()
            });
        });

        // Return order with items
        const completeOrder = await Order.findByPk(order.id, {
            include: [{ model: OrderItem, as: 'items' }]
        });

        res.status(201).json(completeOrder);
    } catch (error) {
        // Rollback transaction on any error
        await transaction.rollback();
        
        logger.error('Order creation error', { 
            error: error.message, 
            stack: error.stack,
            userId,
            items 
        });
        
        res.status(400).json({ 
            message: error.message,
            code: 'ORDER_CREATION_FAILED'
        });
    }
});

// Get all orders endpoint
app.get('/orders', async (req, res) => {
    try {
        const orders = await Order.findAll({ include: [{ model: OrderItem, as: 'items' }] });
        res.json(orders);
    } catch (error) {
        logger.error('Fetch orders error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Order Service is running');
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Kafka event sending with retry logic and proper message ID
async function sendOrderEventWithRetry(event, retries = 3) {
    let attempt = 0;

    while (attempt < retries) {
        try {
            // Producer is long-lived and connected at startup
            await producer.send({
                topic: 'order-events',
                messages: [{
                    key: event.orderId ? event.orderId.toString() : undefined,
                    value: message.stringifyEnvelope(event.eventType, event)
                }]
            });

            logger.info('Event sent successfully', { eventType: event.eventType });
            return;
        } catch (err) {
            attempt++;
            logger.warn(`Event send attempt ${attempt} failed`, { error: err.message });

            if (attempt === retries) {
                const envelope = message.createEnvelope(event.eventType, event);
                logger.error('Kafka event failed after retries, saving to dead-letter', {
                    messageId: envelope.messageId,
                    event,
                    error: err.message
                });
                // Save to dead-letter table for manual processing
                try {
                    await saveToDeadLetter(envelope.messageId, event, err.message);
                } catch (dlErr) {
                    logger.error('Failed to save to dead letter in sendOrderEventWithRetry', { dlError: dlErr.message });
                }
            } else {
                // Exponential backoff with jitter
                const backoffMs = Math.min(2000, Math.pow(2, attempt) * 100) + Math.floor(Math.random() * 100);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
        }
    }
}

// Handle stock reservation failure
async function handleStockReservationFailure(orderId) {
    const transaction = await sequelize.transaction();
    try {
        const order = await Order.findByPk(orderId, { transaction });
        if (order) {
            await order.update({ status: 'CANCELLED' }, { transaction });
            await transaction.commit();
            logger.info('Order cancelled due to stock reservation failure', { orderId });
        }
    } catch (error) {
        await transaction.rollback();
        logger.error('Error cancelling order', { orderId, error: error.message });
    }
}

// Save failed events to dead letter table
async function saveToDeadLetter(messageId, event, errorMessage) {
    try {
        // Persist dead-letter entry for manual inspection / replay
        await DeadLetterEvent.create({
            id: messageId,
            eventType: event && event.eventType ? event.eventType : (event && event.type ? event.type : 'UNKNOWN'),
            payload: event,
            errorMessage
        });

        logger.error('Saved event to dead letter table', { messageId, errorMessage });
    } catch (error) {
        logger.error('Failed to save to dead letter queue', { error: error.message });
    }
}

// Kafka consumer for order events (removed stock logic - handled by product service)
const consumeOrderEvents = async () => {
    await consumer.connect();
    await consumer.subscribe({ topic: 'order-events', fromBeginning: true });
    await consumer.run({
        eachMessage: async ({ message: kafkaMessage }) => {
            try {
                const envelope = message.parseEnvelope(kafkaMessage.value);
                if (!envelope) {
                    logger.warn('Received invalid message envelope');
                    return;
                }
                const { messageId, eventType, payload } = envelope;

                // Implement idempotency check
                const processedEvent = await ProcessedEvent.findByPk(messageId);
                if (processedEvent) {
                    logger.info('Event already processed, skipping', { messageId, eventType });
                    return;
                }

                switch (eventType) {
                    case 'STOCK_RESERVED':
                        logger.info('Stock reserved for order', { 
                            orderId: payload.orderId,
                            items: payload.items ? payload.items.length : 0
                        });
                        break;
                    
                    case 'STOCK_RESERVATION_FAILED':
                        // Handle failed stock reservation - cancel the order
                        await handleStockReservationFailure(payload.orderId);
                        break;
                    
                    case 'ORDER_CANCELLED':
                        logger.info('Order cancelled event received', { orderId: payload.orderId });
                        break;
                        
                    default:
                        logger.warn('Unknown event type received', { eventType, payload });
                }

                // Mark event as processed
                await ProcessedEvent.create({ 
                    id: messageId, 
                    eventType, 
                    processedAt: new Date() 
                });

            } catch (error) {
                logger.error('Error processing order event', { 
                    error: error.message, 
                    stack: error.stack 
                });
            }
        },
    });
};

// Example usage in routes and error handling
app.get('/health', (req, res) => {
  logger.info('Health check requested');
  res.json({ status: 'ok' });
});

app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ message: 'Internal Server Error' });
});

// Order cancellation endpoint
app.post('/orders/:orderId/cancel', async (req, res) => {
    const { orderId } = req.params;
    const transaction = await sequelize.transaction();
    
    try {
        const order = await Order.findByPk(orderId, {
            include: [{ model: OrderItem, as: 'items' }],
            transaction
        });
        
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        
        if (order.status === 'CANCELLED') {
            return res.status(400).json({ message: 'Order already cancelled' });
        }
        
        // Update order status
        await order.update({ status: 'CANCELLED' }, { transaction });
        await transaction.commit();
        
        // Send cancellation event to release stock
        await sendOrderEventWithRetry({
            eventType: 'ORDER_CANCELLED',
            orderId: order.id,
            items: order.items.map(item => ({
                productId: item.productId,
                quantity: item.quantity
            }))
        });
        
        logger.info('Order cancelled successfully', { orderId });
        res.json({ success: true, message: 'Order cancelled successfully' });
        
    } catch (error) {
        await transaction.rollback();
        logger.error('Error cancelling order', { orderId, error: error.message });
        res.status(500).json({ message: error.message });
    }
});

// Wait for Kafka brokers DNS to be resolvable before attempting to connect
async function waitForBrokers(brokers, timeoutMs = 120000) {
  const hosts = brokers.map(b => b.split(':')[0]);
  const start = Date.now();
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  while (Date.now() - start < timeoutMs) {
    try {
      for (const host of hosts) {
        // Try to resolve the host via DNS
        await dns.lookup(host);
      }
      return true;
    } catch (err) {
      logger.info('Waiting for Kafka broker DNS to resolve', { error: err.code || err.message });
      await delay(2000);
    }
  }
  throw new Error('Timed out waiting for Kafka brokers to be resolvable');
}

// Start service
const start = async () => {
    await sequelize.sync({ alter: true }); // This will add missing columns

    // Wait for Kafka brokers DNS to be resolvable before attempting to connect
    try {
        await waitForBrokers(kafkaBrokers, 120000);
    } catch (err) {
        logger.warn('Kafka brokers did not resolve in time, continuing startup and will retry connects', { error: err.message });
    }

    // Connect a single long-lived Kafka producer to be reused for all sends
    try {
        await producer.connect();
        logger.info('Kafka producer connected');
    } catch (err) {
        logger.error('Failed to connect Kafka producer on startup', { error: err.message });
        // Do not throw: allow retries when sending
    }

    // Start consumer with retry logic
    (async function startConsumerWithRetry(retries = 10) {
        let attempt = 0;
        while (attempt < retries) {
            try {
                await consumeOrderEvents(); // this connects the consumer inside
                logger.info('Kafka consumer started');
                break;
            } catch (err) {
                attempt++;
                logger.warn(`Consumer start attempt ${attempt} failed`, { error: err.message });
                const backoff = Math.min(30000, 1000 * Math.pow(2, attempt));
                await new Promise(r => setTimeout(r, backoff));
            }
        }
        if (attempt === retries) {
            logger.error('Failed to start Kafka consumer after retries');
        }
    })();

    const server = app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });

    // Graceful shutdown handlers
    const gracefulShutdown = async () => {
        logger.info('Shutting down gracefully...');
        try {
            if (server) {
                server.close(() => logger.info('HTTP server closed'));
            }

            try {
                if (producer) {
                    await producer.disconnect();
                    logger.info('Kafka producer disconnected');
                }
            } catch (pErr) {
                logger.warn('Error disconnecting producer', { error: pErr.message });
            }

            try {
                if (consumer) {
                    await consumer.disconnect();
                    logger.info('Kafka consumer disconnected');
                }
            } catch (cErr) {
                logger.warn('Error disconnecting consumer', { error: cErr.message });
            }

            try {
                await sequelize.close();
                logger.info('Database connection closed');
            } catch (dbErr) {
                logger.warn('Error closing DB connection', { error: dbErr.message });
            }

            process.exit(0);
        } catch (err) {
            logger.error('Error during graceful shutdown', { error: err.message });
            process.exit(1);
        }
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
};
start();

module.exports = app;

