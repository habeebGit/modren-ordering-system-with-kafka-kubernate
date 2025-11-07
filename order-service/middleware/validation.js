const Joi = require('joi');
const { body, param, query, validationResult } = require('express-validator');
const sanitizeHtml = require('sanitize-html');
const xss = require('xss');

/**
 * Sanitization middleware using sanitize-html and xss
 */
const sanitizeInput = (req, res, next) => {
  const sanitizeValue = (value) => {
    if (typeof value === 'string') {
      // Remove HTML tags and prevent XSS
      return xss(sanitizeHtml(value, {
        allowedTags: [], // No HTML tags allowed
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

  // Sanitize request body, query params, and route params
  sanitizeObject(req.body);
  sanitizeObject(req.query);
  sanitizeObject(req.params);
  
  next();
};

/**
 * Joi validation schemas
 */
const schemas = {
  // Order creation validation
  createOrder: Joi.object({
    userId: Joi.number().integer().positive().required()
      .messages({
        'number.base': 'User ID must be a number',
        'number.integer': 'User ID must be an integer',
        'number.positive': 'User ID must be positive',
        'any.required': 'User ID is required'
      }),
    items: Joi.array().items(
      Joi.object({
        productId: Joi.number().integer().positive().required()
          .messages({
            'number.base': 'Product ID must be a number',
            'number.integer': 'Product ID must be an integer',
            'number.positive': 'Product ID must be positive',
            'any.required': 'Product ID is required'
          }),
        quantity: Joi.number().integer().min(1).max(1000).required()
          .messages({
            'number.base': 'Quantity must be a number',
            'number.integer': 'Quantity must be an integer',
            'number.min': 'Quantity must be at least 1',
            'number.max': 'Quantity cannot exceed 1000',
            'any.required': 'Quantity is required'
          })
      })
    ).min(1).max(50).required()
      .messages({
        'array.min': 'At least 1 item is required',
        'array.max': 'Maximum 50 items allowed per order',
        'any.required': 'Items array is required'
      })
  }),

  // Order update validation
  updateOrderStatus: Joi.object({
    status: Joi.string().valid('Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled').required()
      .messages({
        'any.only': 'Status must be one of: Pending, Confirmed, Shipped, Delivered, Cancelled',
        'any.required': 'Status is required'
      })
  }),

  // Pagination validation
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1)
      .messages({
        'number.base': 'Page must be a number',
        'number.integer': 'Page must be an integer',
        'number.min': 'Page must be at least 1'
      }),
    limit: Joi.number().integer().min(1).max(100).default(20)
      .messages({
        'number.base': 'Limit must be a number',
        'number.integer': 'Limit must be an integer',
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 100'
      }),
    sortBy: Joi.string().valid('id', 'createdAt', 'updatedAt', 'status').default('createdAt')
      .messages({
        'any.only': 'Sort by must be one of: id, createdAt, updatedAt, status'
      }),
    sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC')
      .messages({
        'any.only': 'Sort order must be ASC or DESC'
      })
  }),

  // ID parameter validation
  orderId: Joi.number().integer().positive().required()
    .messages({
      'number.base': 'Order ID must be a number',
      'number.integer': 'Order ID must be an integer',
      'number.positive': 'Order ID must be positive',
      'any.required': 'Order ID is required'
    })
};

/**
 * Generic Joi validation middleware
 */
const validateSchema = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errorMessages
      });
    }

    // Replace the request property with validated and sanitized data
    req[property] = value;
    next();
  };
};

/**
 * Express-validator validation rules
 */
const validationRules = {
  createOrder: [
    body('userId')
      .isInt({ min: 1 })
      .withMessage('User ID must be a positive integer'),
    body('items')
      .isArray({ min: 1, max: 50 })
      .withMessage('Items must be an array with 1-50 items'),
    body('items.*.productId')
      .isInt({ min: 1 })
      .withMessage('Product ID must be a positive integer'),
    body('items.*.quantity')
      .isInt({ min: 1, max: 1000 })
      .withMessage('Quantity must be between 1 and 1000')
  ],

  updateOrderStatus: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Order ID must be a positive integer'),
    body('status')
      .isIn(['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'])
      .withMessage('Invalid status value')
  ],

  getOrders: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('sortBy')
      .optional()
      .isIn(['id', 'createdAt', 'updatedAt', 'status'])
      .withMessage('Sort by must be one of: id, createdAt, updatedAt, status'),
    query('sortOrder')
      .optional()
      .isIn(['ASC', 'DESC'])
      .withMessage('Sort order must be ASC or DESC')
  ],

  getOrderById: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Order ID must be a positive integer')
  ]
};

/**
 * Express-validator error handling middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => error.msg)
    });
  }
  next();
};

/**
 * Security headers and input size limits
 */
const securityMiddleware = (req, res, next) => {
  // Limit request size
  if (req.headers['content-length'] && parseInt(req.headers['content-length']) > 1024 * 1024) {
    return res.status(413).json({
      success: false,
      message: 'Request entity too large'
    });
  }

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  next();
};

module.exports = {
  sanitizeInput,
  validateSchema,
  validationRules,
  handleValidationErrors,
  securityMiddleware,
  schemas
};
