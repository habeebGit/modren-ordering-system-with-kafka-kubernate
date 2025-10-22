const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');
const { Kafka } = require('kafkajs');
const axios = require('axios');
const app = express();
const port = 3001;

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

        // Kafka event (see below for retry)
        await sendOrderEventWithRetry({ orderId: order.id, userId, items });

        res.status(201).json(order);
    } catch (error) {
        console.error('Order creation error:', error);
        res.status(400).json({ message: error.message });
    }
});

// Get all orders endpoint
app.get('/orders', async (req, res) => {
    try {
        const orders = await Order.findAll({ include: [{ model: OrderItem, as: 'items' }] });
        res.json(orders);
    } catch (error) {
        console.error('Fetch orders error:', error);
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
                console.error('Kafka event failed after retries, sending to dead-letter:', event, err);
                // Optionally, save to a dead-letter table here
            }
        }
    }
}

// Start service
const start = async () => {
    await sequelize.sync();
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
};
start();

