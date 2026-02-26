const message = require('../lib/message');

describe('product-service message helper', () => {
  test('createEnvelope returns expected envelope', () => {
    const env = message.createEnvelope('STOCK_RESERVED', { orderId: 1 });
    expect(env).toHaveProperty('messageId');
    expect(env.eventType).toBe('STOCK_RESERVED');
    expect(env.payload.orderId).toBe(1);
    expect(typeof env.timestamp).toBe('string');
  });

  test('stringify and parse roundtrip', () => {
    const s = message.stringifyEnvelope('STOCK_RESERVED', { a: 'b' });
    const p = message.parseEnvelope(s);
    expect(p).not.toBeNull();
    expect(p.payload).toEqual({ a: 'b' });
  });
});
