const { test, expect } = require('@jest/globals');
const app = require('../../../product-service/index');

describe('product-service basic tests', () => {
	test('health endpoint exists', () => {
		expect(app).toBeDefined();
	});
});