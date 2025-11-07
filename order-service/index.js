const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');
const { Kafka } = require('kafkajs');
const axios = require('axios');
const winston = require('winston');
const morgan = require('morgan');
const client = require('prom-client');

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

// Kafka setup
const kafka = new Kafka({ brokers: ['kafka:9092'] });
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
            logger.info('Event sent successfully', { messageId, eventType: event.eventType });
            return;
        } catch (err) {
            attempt++;
            logger.warn(`Event send attempt ${attempt} failed`, { messageId, error: err.message });
            if (attempt === retries) {
                logger.error('Kafka event failed after retries, saving to dead-letter', { 
                    messageId, 
                    event, 
                    error: err.message 
                });
                // Save to dead-letter table for manual processing
                await saveToDeadLetter(messageId, event, err.message);
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
        // You can create a DeadLetterEvent model for this
        logger.error('Saving to dead letter queue', { messageId, event, errorMessage });
        // TODO: Implement proper dead letter storage
    } catch (error) {
        logger.error('Failed to save to dead letter queue', { error: error.message });
    }
}

// Kafka consumer for order events (removed stock logic - handled by product service)
const consumeOrderEvents = async () => {
    await consumer.connect();
    await consumer.subscribe({ topic: 'order-events', fromBeginning: true });
    await consumer.run({
        eachMessage: async ({ message }) => {
            try {
                const { eventType, event, messageId } = JSON.parse(message.value.toString());
                
                // Implement idempotency check
                const processedEvent = await ProcessedEvent.findByPk(messageId);
                if (processedEvent) {
                    logger.info('Event already processed, skipping', { messageId, eventType });
                    return;
                }

                switch (eventType) {
                    case 'STOCK_RESERVED':
                        logger.info('Stock reserved for order', { 
                            orderId: event.orderId,
                            items: event.items.length 
                        });
                        break;
                    
                    case 'STOCK_RESERVATION_FAILED':
                        // Handle failed stock reservation - cancel the order
                        await handleStockReservationFailure(event.orderId);
                        break;
                    
                    case 'ORDER_CANCELLED':
                        logger.info('Order cancelled event received', { orderId: event.orderId });
                        break;
                        
                    default:
                        logger.warn('Unknown event type received', { eventType, event });
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

// Start service
const start = async () => {
    await sequelize.sync({ alter: true }); // This will add missing columns
    consumeOrderEvents(); // Start the Kafka consumer
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
};
start();

module.exports = app;

