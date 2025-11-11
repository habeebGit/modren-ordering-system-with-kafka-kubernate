const promClient = require('prom-client');

// Create a Registry
const register = new promClient.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: process.env.SERVICE_NAME || 'ordering-service'
});

// Enable the collection of default metrics
promClient.collectDefaultMetrics({ register });

// Custom Business Metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const businessMetrics = {
  ordersCreated: new promClient.Counter({
    name: 'orders_created_total',
    help: 'Total number of orders created',
    labelNames: ['status', 'user_id']
  }),

  productsViewed: new promClient.Counter({
    name: 'products_viewed_total',
    help: 'Total number of product views',
    labelNames: ['product_id', 'category']
  }),

  userRegistrations: new promClient.Counter({
    name: 'user_registrations_total',
    help: 'Total number of user registrations',
    labelNames: ['role']
  }),

  authenticationAttempts: new promClient.Counter({
    name: 'authentication_attempts_total',
    help: 'Total authentication attempts',
    labelNames: ['result', 'type']
  }),

  databaseConnections: new promClient.Gauge({
    name: 'database_connections_active',
    help: 'Number of active database connections',
    labelNames: ['database']
  }),

  kafkaMessages: new promClient.Counter({
    name: 'kafka_messages_total',
    help: 'Total Kafka messages processed',
    labelNames: ['topic', 'status', 'consumer_group']
  }),

  stockLevels: new promClient.Gauge({
    name: 'product_stock_level',
    help: 'Current stock level for products',
    labelNames: ['product_id', 'product_name']
  }),

  revenue: new promClient.Counter({
    name: 'revenue_total',
    help: 'Total revenue generated',
    labelNames: ['currency']
  })
};

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
Object.values(businessMetrics).forEach(metric => register.registerMetric(metric));

// Middleware to track HTTP metrics
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const labels = {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode
    };
    
    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);
  });
  
  next();
};

// Helper function to update business metrics
const updateBusinessMetric = (metricName, operation, labels = {}, value = 1) => {
  const metric = businessMetrics[metricName];
  if (!metric) {
    console.error(`Metric ${metricName} not found`);
    return;
  }

  try {
    switch (operation) {
      case 'inc':
        metric.inc(labels, value);
        break;
      case 'set':
        metric.set(labels, value);
        break;
      case 'observe':
        metric.observe(labels, value);
        break;
      default:
        metric.inc(labels, value);
    }
  } catch (error) {
    console.error(`Error updating metric ${metricName}:`, error);
  }
};

module.exports = {
  register,
  metricsMiddleware,
  updateBusinessMetric,
  businessMetrics
};