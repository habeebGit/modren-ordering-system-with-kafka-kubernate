// Set test environment first
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.KAFKA_BROKERS = 'localhost:9092';
process.env.PORT = '3001';

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

// Mock timers to prevent actual delays
jest.useFakeTimers();

// Mock all the dependencies similar to product-service
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

jest.mock('express', () => {
  const mockApp = {
    use: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    listen: jest.fn((port, callback) => {
      if (callback && typeof callback === 'function') {
        setTimeout(callback, 0);
      }
      return { 
        close: jest.fn((callback) => {
          if (callback) setTimeout(callback, 0);
        }) 
      };
    })
  };
  
  const mockExpress = jest.fn(() => mockApp);
  mockExpress.json = jest.fn(() => jest.fn());
  mockExpress.urlencoded = jest.fn(() => jest.fn());
  
  return mockExpress;
});

jest.mock('cors', () => jest.fn(() => (req, res, next) => {
  if (next) next();
}));

jest.mock('sequelize', () => {
  const mockModel = {
    create: jest.fn().mockImplementation((data) => 
      Promise.resolve({ 
        id: 1, 
        ...data, 
        toJSON: () => ({ id: 1, ...data }),
        get: (key) => data[key] || null
      })
    ),
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
    transaction: jest.fn(() => Promise.resolve({
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true)
    })),
    Op: {
      lt: Symbol('lt'),
      gt: Symbol('gt'),
      eq: Symbol('eq'),
      and: Symbol('and'),
      or: Symbol('or')
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

jest.mock('kafkajs', () => ({
  Kafka: jest.fn(() => ({
    producer: jest.fn(() => ({
      connect: jest.fn().mockResolvedValue(true),
      send: jest.fn().mockResolvedValue([{ 
        topicName: 'test-topic',
        partition: 0,
        errorCode: 0,
        baseOffset: '0',
        logAppendTime: '-1',
        logStartOffset: '0'
      }]),
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

jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({ data: [] }),
  post: jest.fn().mockResolvedValue({ data: { success: true } })
}));

global.setInterval = jest.fn();
global.clearInterval = jest.fn();

// Restore after tests
afterAll(() => {
  process.exit = originalExit;
  jest.useRealTimers();
});