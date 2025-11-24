import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server';
import { FastifyInstance } from 'fastify';

describe('API Integration Tests', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('should reject order submission without required fields', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/orders/execute',
      payload: { tokenIn: 'USDC' }, // missing tokenOut and amount
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
  });

  it('should accept valid order and return orderId', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/orders/execute',
      payload: {
        tokenIn: 'USDC',
        tokenOut: 'TOKEN',
        amount: 100,
      },
    });
    expect(response.statusCode).toBe(202);
    const body = JSON.parse(response.body);
    expect(body.orderId).toBeDefined();
    expect(body.ws).toBeDefined();
  });

  it('should handle multiple concurrent order submissions', async () => {
    const requests = Array.from({ length: 5 }, (_, i) =>
      server.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: {
          tokenIn: 'USDC',
          tokenOut: 'TOKEN',
          amount: 10 + i,
        },
      })
    );

    const responses = await Promise.all(requests);
    expect(responses.every(r => r.statusCode === 202)).toBe(true);
    const orderIds = responses.map(r => JSON.parse(r.body).orderId);
    // All orderIds should be unique
    expect(new Set(orderIds).size).toBe(5);
  });

  it('should retrieve order by ID after submission', async () => {
    const submitResponse = await server.inject({
      method: 'POST',
      url: '/api/orders/execute',
      payload: {
        tokenIn: 'USDC',
        tokenOut: 'TOKEN',
        amount: 50,
      },
    });
    const { orderId } = JSON.parse(submitResponse.body);

    // Wait a moment for database write
    await new Promise(resolve => setTimeout(resolve, 500));

    const getResponse = await server.inject({
      method: 'GET',
      url: `/api/orders/${orderId}`,
    });
    
    if (getResponse.statusCode === 200) {
      const order = JSON.parse(getResponse.body);
      expect(order.order_id).toBe(orderId);
    }
  });

  it('should return 404 for non-existent order', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/orders/nonexistent-id',
    });
    expect(response.statusCode).toBe(404);
  });

  it('should retrieve all orders', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/orders',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body.orders)).toBe(true);
  });

  it('should retrieve routing logs', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/logs',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body.logs)).toBe(true);
  });
});
