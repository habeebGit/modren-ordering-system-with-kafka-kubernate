const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');
const { Kafka } = require('kafkajs');
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

// Kafka setup
const kafka = new Kafka({ brokers: ['kafka:9092'] });
const producer = kafka.producer();

// Order creation endpoint
app.post('/orders', async (req, res) => {
    const { userId, items } = req.body;
    try {
        const order = await Order.create({ userId });
        const event = { orderId: order.id, userId, items };
        
        await producer.connect();
        await producer.send({
            topic: 'order-events',
            messages: [{ value: JSON.stringify({ type: 'order-created', event }) }]
        });
        await producer.disconnect();

        res.status(201).json(order);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Get all orders endpoint
app.get('/orders', async (req, res) => {
    try {
        const orders = await Order.findAll();
        res.json(orders);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Order Service is running');
});

// Start service
const start = async () => {
    await sequelize.sync();
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
};
start();

