const { v4: uuidv4 } = require('uuid');

function createEnvelope(eventType, payload) {
  return {
    messageId: uuidv4(),
    eventType,
    payload,
    timestamp: new Date().toISOString()
  };
}

function stringifyEnvelope(eventType, payload) {
  return JSON.stringify(createEnvelope(eventType, payload));
}

function parseEnvelope(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) value = value.toString();
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
}

module.exports = { createEnvelope, stringifyEnvelope, parseEnvelope };
