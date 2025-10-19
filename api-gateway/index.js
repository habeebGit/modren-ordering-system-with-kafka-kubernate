const express = require('express');
const httpProxy = require('express-http-proxy');
const app = express();
const port = 3000;

app.use(express.json());

// Proxy requests to the respective microservices
app.use('/orders', httpProxy('http://order-service:3001'));
app.use('/products', httpProxy('http://product-service:3002'));

app.listen(port, () => {
    console.log(`API Gateway running on http://localhost:${port}`);
});

