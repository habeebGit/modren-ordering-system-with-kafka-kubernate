// Set test environment first
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.KAFKA_BROKERS = 'localhost:9092';
process.env.PORT = '3002';

// Mock console methods to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock process.exit to prevent tests from exiting
const originalExit = process.exit;
process.exit = jest.fn();

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// DON'T mock express - let the test use real express
// The test file creates its own Express app

// Mock cors
jest.mock('cors', () => jest.fn(() => (req, res, next) => {
  if (next) next();
}));

// Mock Sequelize completely
jest.mock('sequelize', () => {
  const mockModel = {
    create: jest.fn().mockResolvedValue({ id: 1, toJSON: () => ({ id: 1 }) }),
    findAll: jest.fn().mockResolvedValue([]),
    findByPk: jest.fn().mockResolvedValue(null),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    sync: jest.fn().mockResolvedValue(true),
    hasMany: jest.fn(),
    belongsTo: jest.fn()
  };

  const mockSequelize = jest.fn(() => ({
    authenticate: jest.fn().mockResolvedValue(true),
    sync: jest.fn().mockResolvedValue(true),
    define: jest.fn(() => mockModel),
    transaction: jest.fn(() => ({
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true)
    })),
    Op: {
      lt: Symbol('lt'),
      gt: Symbol('gt'),
      eq: Symbol('eq')
    }
  }));

  mockSequelize.DataTypes = {
    INTEGER: 'INTEGER',
    STRING: 'STRING',
    DECIMAL: 'DECIMAL',
    BOOLEAN: 'BOOLEAN',
    DATE: 'DATE',
    ENUM: jest.fn(() => 'ENUM'),
    VIRTUAL: 'VIRTUAL'
  };

  return { Sequelize: mockSequelize, DataTypes: mockSequelize.DataTypes };
});

// Mock Kafka
jest.mock('kafkajs', () => ({
  Kafka: jest.fn(() => ({
    producer: jest.fn(() => ({
      connect: jest.fn().mockResolvedValue(true),
      send: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(true)
    })),
    consumer: jest.fn(() => ({
      connect: jest.fn().mockResolvedValue(true),
      subscribe: jest.fn().mockResolvedValue(true),
      run: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(true)
    }))
  }))
}));

// Mock axios
jest.mock('axios', () => ({
  get: jest.fn().mockImplementation((url) => {
    // Mock external API calls
    if (url && url.includes('external')) {
      return Promise.resolve({ 
        data: [
          { id: 1, name: 'External Product 1', price: 25.99 },
          { id: 2, name: 'External Product 2', price: 35.99 }
        ] 
      });
    }
    return Promise.resolve({ data: [] });
  }),
  post: jest.fn().mockResolvedValue({ data: { success: true } })
}));

// Mock setInterval to prevent actual timers in tests
global.setInterval = jest.fn((fn, delay) => {
  return { id: 1 }; // Return a mock timer ID
});
global.clearInterval = jest.fn();

// Suppress unhandled promise rejections in tests
const rejectionHandler = (reason, promise) => {
  // Silently ignore in test environment
};

process.on('unhandledRejection', rejectionHandler);

// Restore after tests
afterAll(() => {
  process.exit = originalExit;
  process.removeListener('unhandledRejection', rejectionHandler);
});