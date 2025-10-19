const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const { Kafka } = require('kafkajs');
const axios = require('axios');
const cors = require('cors');
const app = express();
const port = 3002;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
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

// Product Model
const Product = sequelize.define('Product', {
    name: { type: DataTypes.STRING, allowNull: false },
    stock: { type: DataTypes.INTEGER, defaultValue: 0 }
});

// Kafka setup
const kafka = new Kafka({ brokers: ['kafka:9092'] });
const consumer = kafka.consumer({ groupId: 'product-group' });

// Kafka consumer for order events
const consumeOrderEvents = async () => {
    await consumer.connect();
    await consumer.subscribe({ topic: 'order-events', fromBeginning: true });
    await consumer.run({
        eachMessage: async ({ message }) => {
            const { type, event } = JSON.parse(message.value.toString());
            if (type === 'order-created') {
                // Deduct stock for each item in the order
                for (const item of event.items) {
                    const product = await Product.findByPk(item.productId);
                    if (product && product.stock >= item.quantity) {
                        product.stock -= item.quantity;
                        await product.save();
                        console.log(`Deducted stock for product ${item.productId}`);
                    }
                }
            }
        },
    });
};

app.get('/products', async (req, res) => {
  const products = await Product.findAll();
  res.json(products);
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

// Start service
const start = async () => {
  try {
    await sequelize.sync({ force: true });
    await Product.bulkCreate([{ name: 'Laptop', stock: 100 }, { name: 'Mouse', stock: 250 }]);
    consumeOrderEvents();
    app.listen(port, () => console.log(`Product Service running on port ${port}`));
  } catch (error) {
    console.error('Startup error:', error);
    process.exit(1); // Exit with error
  }
};
start();

