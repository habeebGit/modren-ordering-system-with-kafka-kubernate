const message = require('../lib/message');

describe('message helper', () => {
  test('createEnvelope returns envelope with required fields', () => {
    const env = message.createEnvelope('TEST_EVENT', { foo: 'bar' });
    expect(env).toHaveProperty('messageId');
    expect(env).toHaveProperty('eventType', 'TEST_EVENT');
    expect(env).toHaveProperty('payload');
    expect(env.payload).toEqual({ foo: 'bar' });
    expect(env).toHaveProperty('timestamp');
  });

  test('stringifyEnvelope returns JSON string and parseEnvelope roundtrips', () => {
    const str = message.stringifyEnvelope('TEST_EVENT', { n: 1 });
    const parsed = message.parseEnvelope(str);
    expect(parsed).not.toBeNull();
    expect(parsed).toHaveProperty('messageId');
    expect(parsed).toHaveProperty('eventType', 'TEST_EVENT');
    expect(parsed.payload).toEqual({ n: 1 });
  });
});
