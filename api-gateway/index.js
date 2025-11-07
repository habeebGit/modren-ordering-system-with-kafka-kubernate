const express = require('express');
const httpProxy = require('express-http-proxy');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { body, param, validationResult } = require('express-validator');
const sanitizeHtml = require('sanitize-html');
const xss = require('xss');
const winston = require('winston');

const app = express();
const port = 3000;

// Logger setup
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

// Security middleware
app.use(helmet());

// Rate limiting - more restrictive for API Gateway
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs for gateway
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['http://localhost:3000', 'https://yourdomain.com'] // Add your production domains
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({
        success: false,
        message: 'Invalid JSON payload'
      });
      throw new Error('Invalid JSON');
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  const sanitizeValue = (value) => {
    if (typeof value === 'string') {
      return xss(sanitizeHtml(value, {
        allowedTags: [],
        allowedAttributes: {}
      }));
    }
    return value;
  };

  const sanitizeObject = (obj) => {
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        } else {
          obj[key] = sanitizeValue(obj[key]);
        }
      });
    }
  };

  sanitizeObject(req.body);
  sanitizeObject(req.query);
  sanitizeObject(req.params);
  next();
};

app.use(sanitizeInput);

// Request logging
app.use((req, res, next) => {
  logger.info('API Gateway Request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API Gateway is healthy',
    timestamp: new Date().toISOString()
  });
});

// Proxy configuration with error handling
const proxyOptions = {
  timeout: 30000, // 30 seconds
  proxyErrorHandler: (err, res, next) => {
    logger.error('Proxy Error', { error: err.message });
    res.status(503).json({
      success: false,
      message: 'Service temporarily unavailable'
    });
  },
  userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
    // Add response logging
    logger.info('Service Response', {
      method: userReq.method,
      url: userReq.url,
      statusCode: proxyRes.statusCode,
      responseTime: Date.now() - userReq.startTime
    });
    return proxyResData;
  }
};

// Add timestamp for response time calculation
app.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});

// Proxy routes with validation
app.use('/api/orders', 
  // Add basic validation for order routes
  (req, res, next) => {
    if (req.method === 'POST' && req.path === '/') {
      // Validate order creation request
      return body(['userId', 'items']).notEmpty().run(req, res, next);
    }
    next();
  },
  httpProxy(process.env.ORDER_SERVICE_URL || 'http://order-service:3001', {
    ...proxyOptions,
    proxyReqPathResolver: (req) => `/orders${req.url}`
  })
);

app.use('/api/products', 
  httpProxy(process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002', {
    ...proxyOptions,
    proxyReqPathResolver: (req) => `/products${req.url}`
  })
);

// Fallback route
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global error handler
app.use((error, req, res, next) => {
  logger.error('API Gateway Error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });
  
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

app.listen(port, () => {
    logger.info(`API Gateway running on http://localhost:${port}`);
});

