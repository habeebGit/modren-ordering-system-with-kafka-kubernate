/**
 * Global error handling middleware for Express applications
 */

const winston = require('winston');

// Logger setup
const logger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log' })
  ]
});

/**
 * Custom error classes for better error handling
 */
class ValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.errors = errors;
  }
}

class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

class ConflictError extends Error {
  constructor(message = 'Resource conflict') {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

class AuthenticationError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
  }
}

class AuthorizationError extends Error {
  constructor(message = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
  }
}

class ServiceUnavailableError extends Error {
  constructor(message = 'Service temporarily unavailable') {
    super(message);
    this.name = 'ServiceUnavailableError';
    this.statusCode = 503;
  }
}

/**
 * Async error wrapper to catch async errors in route handlers
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Global error handling middleware
 */
const globalErrorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error('Error occurred', {
    error: error.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Sequelize validation error
  if (err.name === 'SequelizeValidationError') {
    const message = 'Validation Error';
    const errors = err.errors.map(error => error.message);
    error = new ValidationError(message, errors);
  }

  // Sequelize unique constraint error
  if (err.name === 'SequelizeUniqueConstraintError') {
    const message = 'Resource already exists';
    error = new ConflictError(message);
  }

  // Sequelize foreign key constraint error
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    const message = 'Referenced resource not found';
    error = new ValidationError(message);
  }

  // Sequelize database connection error
  if (err.name === 'SequelizeConnectionError') {
    const message = 'Database connection failed';
    error = new ServiceUnavailableError(message);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new AuthenticationError(message);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new AuthenticationError(message);
  }

  // Axios/HTTP errors
  if (err.isAxiosError) {
    const message = err.response?.data?.message || 'External service error';
    const statusCode = err.response?.status || 503;
    error.statusCode = statusCode;
    error.message = message;
  }

  // Default to 500 server error
  if (!error.statusCode) {
    error.statusCode = 500;
    error.message = 'Internal server error';
  }

  // Construct error response
  const errorResponse = {
    success: false,
    message: error.message,
    ...(error.errors && { errors: error.errors })
  };

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  res.status(error.statusCode).json(errorResponse);
};

/**
 * 404 handler for unmatched routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

/**
 * Process exit handlers for graceful shutdown
 */
const setupGracefulShutdown = (server) => {
  const gracefulShutdown = (signal) => {
    logger.info(`${signal} received, starting graceful shutdown...`);
    
    server.close((err) => {
      if (err) {
        logger.error('Error during graceful shutdown', { error: err.message });
        process.exit(1);
      }
      
      logger.info('Server closed successfully');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { 
      reason: reason,
      promise: promise 
    });
    process.exit(1);
  });
};

module.exports = {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthenticationError,
  AuthorizationError,
  ServiceUnavailableError,
  asyncHandler,
  globalErrorHandler,
  notFoundHandler,
  setupGracefulShutdown,
  logger
};
