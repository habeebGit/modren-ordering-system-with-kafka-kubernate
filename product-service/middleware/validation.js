const Joi = require('joi');
const { body, param, query, validationResult } = require('express-validator');
const sanitizeHtml = require('sanitize-html');
const xss = require('xss');

/**
 * Sanitization middleware
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
 * Joi validation schemas for products
 */
const schemas = {
  // Product creation validation
  createProduct: Joi.object({
    name: Joi.string().trim().min(2).max(255).pattern(/^[a-zA-Z0-9\s\-\.\_\(\)]+$/).required()
      .messages({
        'string.base': 'Product name must be a string',
        'string.min': 'Product name must be at least 2 characters long',
        'string.max': 'Product name cannot exceed 255 characters',
        'string.pattern.base': 'Product name contains invalid characters',
        'any.required': 'Product name is required'
      }),
    description: Joi.string().trim().max(1000).optional()
      .messages({
        'string.base': 'Description must be a string',
        'string.max': 'Description cannot exceed 1000 characters'
      }),
    price: Joi.number().precision(2).min(0).max(999999.99).required()
      .messages({
        'number.base': 'Price must be a number',
        'number.min': 'Price cannot be negative',
        'number.max': 'Price cannot exceed 999,999.99',
        'any.required': 'Price is required'
      }),
    stock: Joi.number().integer().min(0).max(1000000).required()
      .messages({
        'number.base': 'Stock must be a number',
        'number.integer': 'Stock must be an integer',
        'number.min': 'Stock cannot be negative',
        'number.max': 'Stock cannot exceed 1,000,000',
        'any.required': 'Stock is required'
      }),
    category: Joi.string().trim().min(2).max(100).pattern(/^[a-zA-Z0-9\s\-\_]+$/).optional()
      .messages({
        'string.base': 'Category must be a string',
        'string.min': 'Category must be at least 2 characters long',
        'string.max': 'Category cannot exceed 100 characters',
        'string.pattern.base': 'Category contains invalid characters'
      }),
    sku: Joi.string().trim().min(2).max(50).pattern(/^[a-zA-Z0-9\-\_]+$/).optional()
      .messages({
        'string.base': 'SKU must be a string',
        'string.min': 'SKU must be at least 2 characters long',
        'string.max': 'SKU cannot exceed 50 characters',
        'string.pattern.base': 'SKU can only contain alphanumeric characters, hyphens, and underscores'
      })
  }),

  // Product update validation
  updateProduct: Joi.object({
    name: Joi.string().trim().min(2).max(255).pattern(/^[a-zA-Z0-9\s\-\.\_\(\)]+$/).optional()
      .messages({
        'string.base': 'Product name must be a string',
        'string.min': 'Product name must be at least 2 characters long',
        'string.max': 'Product name cannot exceed 255 characters',
        'string.pattern.base': 'Product name contains invalid characters'
      }),
    description: Joi.string().trim().max(1000).optional()
      .messages({
        'string.base': 'Description must be a string',
        'string.max': 'Description cannot exceed 1000 characters'
      }),
    price: Joi.number().precision(2).min(0).max(999999.99).optional()
      .messages({
        'number.base': 'Price must be a number',
        'number.min': 'Price cannot be negative',
        'number.max': 'Price cannot exceed 999,999.99'
      }),
    stock: Joi.number().integer().min(0).max(1000000).optional()
      .messages({
        'number.base': 'Stock must be a number',
        'number.integer': 'Stock must be an integer',
        'number.min': 'Stock cannot be negative',
        'number.max': 'Stock cannot exceed 1,000,000'
      }),
    category: Joi.string().trim().min(2).max(100).pattern(/^[a-zA-Z0-9\s\-\_]+$/).optional()
      .messages({
        'string.base': 'Category must be a string',
        'string.min': 'Category must be at least 2 characters long',
        'string.max': 'Category cannot exceed 100 characters',
        'string.pattern.base': 'Category contains invalid characters'
      }),
    sku: Joi.string().trim().min(2).max(50).pattern(/^[a-zA-Z0-9\-\_]+$/).optional()
      .messages({
        'string.base': 'SKU must be a string',
        'string.min': 'SKU must be at least 2 characters long',
        'string.max': 'SKU cannot exceed 50 characters',
        'string.pattern.base': 'SKU can only contain alphanumeric characters, hyphens, and underscores'
      })
  }),

  // Stock update validation
  updateStock: Joi.object({
    quantity: Joi.number().integer().min(-1000000).max(1000000).required()
      .messages({
        'number.base': 'Quantity must be a number',
        'number.integer': 'Quantity must be an integer',
        'number.min': 'Quantity cannot be less than -1,000,000',
        'number.max': 'Quantity cannot exceed 1,000,000',
        'any.required': 'Quantity is required'
      }),
    operation: Joi.string().valid('add', 'subtract', 'set').default('set')
      .messages({
        'any.only': 'Operation must be one of: add, subtract, set'
      })
  }),

  // Stock reservation validation
  reserveStock: Joi.object({
    orderId: Joi.number().integer().positive().required()
      .messages({
        'number.base': 'Order ID must be a number',
        'number.integer': 'Order ID must be an integer',
        'number.positive': 'Order ID must be positive',
        'any.required': 'Order ID is required'
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
        'array.max': 'Maximum 50 items allowed',
        'any.required': 'Items array is required'
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
    sortBy: Joi.string().valid('id', 'name', 'price', 'stock', 'createdAt', 'updatedAt').default('createdAt')
      .messages({
        'any.only': 'Sort by must be one of: id, name, price, stock, createdAt, updatedAt'
      }),
    sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC')
      .messages({
        'any.only': 'Sort order must be ASC or DESC'
      }),
    category: Joi.string().trim().max(100).optional()
      .messages({
        'string.base': 'Category must be a string',
        'string.max': 'Category cannot exceed 100 characters'
      }),
    minPrice: Joi.number().min(0).optional()
      .messages({
        'number.base': 'Min price must be a number',
        'number.min': 'Min price cannot be negative'
      }),
    maxPrice: Joi.number().min(0).optional()
      .messages({
        'number.base': 'Max price must be a number',
        'number.min': 'Max price cannot be negative'
      })
  }),

  // ID parameter validation
  productId: Joi.number().integer().positive().required()
    .messages({
      'number.base': 'Product ID must be a number',
      'number.integer': 'Product ID must be an integer',
      'number.positive': 'Product ID must be positive',
      'any.required': 'Product ID is required'
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
  createProduct: [
    body('name')
      .isLength({ min: 2, max: 255 })
      .matches(/^[a-zA-Z0-9\s\-\.\_\(\)]+$/)
      .withMessage('Product name must be 2-255 characters and contain only valid characters'),
    body('price')
      .isFloat({ min: 0, max: 999999.99 })
      .withMessage('Price must be between 0 and 999,999.99'),
    body('stock')
      .isInt({ min: 0, max: 1000000 })
      .withMessage('Stock must be between 0 and 1,000,000'),
    body('description')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Description cannot exceed 1000 characters'),
    body('category')
      .optional()
      .isLength({ min: 2, max: 100 })
      .matches(/^[a-zA-Z0-9\s\-\_]+$/)
      .withMessage('Category must be 2-100 characters and contain only valid characters'),
    body('sku')
      .optional()
      .isLength({ min: 2, max: 50 })
      .matches(/^[a-zA-Z0-9\-\_]+$/)
      .withMessage('SKU must be 2-50 characters and contain only alphanumeric, hyphen, underscore')
  ],

  updateProduct: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Product ID must be a positive integer'),
    body('name')
      .optional()
      .isLength({ min: 2, max: 255 })
      .matches(/^[a-zA-Z0-9\s\-\.\_\(\)]+$/)
      .withMessage('Product name must be 2-255 characters and contain only valid characters'),
    body('price')
      .optional()
      .isFloat({ min: 0, max: 999999.99 })
      .withMessage('Price must be between 0 and 999,999.99'),
    body('stock')
      .optional()
      .isInt({ min: 0, max: 1000000 })
      .withMessage('Stock must be between 0 and 1,000,000')
  ],

  getProducts: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('category')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Category cannot exceed 100 characters'),
    query('minPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Min price must be non-negative'),
    query('maxPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Max price must be non-negative'),
    query('sortBy')
      .optional()
      .isIn(['name', 'price', 'createdAt', 'updatedAt', 'category'])
      .withMessage('SortBy must be one of: name, price, createdAt, updatedAt, category'),
    query('sortOrder')
      .optional()
      .isIn(['ASC', 'DESC'])
      .withMessage('SortOrder must be either ASC or DESC')
  ],

  getProductById: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Product ID must be a positive integer')
  ],

  updateStock: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Product ID must be a positive integer'),
    body('quantity')
      .isInt({ min: -1000000, max: 1000000 })
      .withMessage('Quantity must be between -1,000,000 and 1,000,000'),
    body('operation')
      .optional()
      .isIn(['add', 'subtract', 'set'])
      .withMessage('Operation must be one of: add, subtract, set')
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
