const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');
const { Kafka } = require('kafkajs');
const axios = require('axios');
const winston = require('winston');
const morgan = require('morgan');
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

// Kafka setup
const kafka = new Kafka({ brokers: ['kafka:9092'] });
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'order-service-group' });

// Order creation endpoint
app.post('/orders', async (req, res) => {
    const { userId, items } = req.body;
    if (!userId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Invalid order payload." });
    }
    try {
        // Validate and decrement stock via product-service
        const stockRes = await axios.post(
            process.env.PRODUCT_SERVICE_URL + '/decrement-stock',
            { items }
        );
        if (!stockRes.data.success) throw new Error("Stock update failed");

        // Create order and order items
        const order = await Order.create({ userId });
        for (const item of items) {
            await OrderItem.create({ OrderId: order.id, ...item });
        }

        logger.info('Order created', { orderId: order.id });

        // Kafka event (see below for retry)
        await sendOrderEventWithRetry({ orderId: order.id, userId, items });

        res.status(201).json(order);
    } catch (error) {
        logger.error('Order creation error', { error: error.message, stack: error.stack });
        res.status(400).json({ message: error.message });
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

// Kafka event sending with retry logic
async function sendOrderEventWithRetry(event, retries = 3) {
    let attempt = 0;
    while (attempt < retries) {
        try {
            await producer.connect();
            await producer.send({
                topic: 'order-events',
                messages: [{ value: JSON.stringify({ type: 'order-created', event }) }]
            });
            await producer.disconnect();
            return;
        } catch (err) {
            attempt++;
            if (attempt === retries) {
                logger.error('Kafka event failed after retries, sending to dead-letter:', event, err);
                // Optionally, save to a dead-letter table here
            }
        }
    }
}

// Kafka consumer for order events
const consumeOrderEvents = async () => {
    await consumer.connect();
    await consumer.subscribe({ topic: 'order-events', fromBeginning: true });
    await consumer.run({
        eachMessage: async ({ message }) => {
            const { type, event } = JSON.parse(message.value.toString());
            if (type === 'order-created') {
                for (const item of event.items) {
                    const product = await Product.findByPk(item.productId);
                    if (product && product.stock >= item.quantity) {
                        product.stock -= item.quantity;
                        await product.save();
                        logger.info(`Deducted stock for product ${item.productId}`);
                        logger.info('Order created', { orderId: event.orderId });
                    } else {
                        logger.error('Order creation failed', { error: 'Insufficient stock', productId: item.productId });
                    }
                }
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

// Decrement stock endpoint
app.post('/decrement-stock', async (req, res) => {
    const { items } = req.body;
    try {
        for (const { productId, quantity } of items) {
            const product = await Product.findByPk(productId);
            if (!product) throw new Error(`Product ${productId} not found`);
            if (product.stock < quantity) throw new Error(`Insufficient stock for product ${product.name}`);
            product.stock -= quantity;
            await product.save();
        }
        logger.info('Stock decremented', { items });
        res.json({ success: true });
    } catch (error) {
        logger.error('Error decrementing stock', { error: error.message, items });
        res.status(400).json({ message: error.message });
    }
});

// Start service
const start = async () => {
    await sequelize.sync();
    consumeOrderEvents(); // Start the Kafka consumer
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
};
start();

module.exports = app;

