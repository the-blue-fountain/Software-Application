import { FastifyInstance } from 'fastify';
import { genId } from '../utils/id.js';
import { ordersQueue } from './queue.js';
import { orderEvents } from './worker.js';
import { Order } from '../types.js';
import { getOrder, getAllOrders } from '../db/database.js';
import { getLogs } from '../utils/logger.js';

type SocketMap = Map<string, any>;
const sockets: SocketMap = new Map();

export function registerOrderRoutes(fastify: FastifyInstance) {
  fastify.post('/api/orders/execute', async (request, reply) => {
    const body = request.body as Partial<Order> | undefined;
    if (!body || !body.tokenIn || !body.tokenOut || !body.amount) {
      return reply.status(400).send({ error: 'tokenIn, tokenOut and amount required' });
    }
    const orderId = genId();
    const order: Order = {
      orderId,
      tokenIn: body.tokenIn,
      tokenOut: body.tokenOut,
      amount: Number(body.amount),
      type: (body.type as any) || 'market',
      createdAt: new Date().toISOString(),
    };

    await ordersQueue.add('exec', order, {
      jobId: orderId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });

    // subscribe to events for in-process notifications
    // reply with orderId and hint to open websocket to same path
    return reply.status(202).send({ orderId, ws: '/api/orders/execute (websocket)' });
  });

  // Get order by ID
  fastify.get('/api/orders/:orderId', async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const order = await getOrder(orderId);
    if (!order) {
      return reply.status(404).send({ error: 'Order not found' });
    }
    return reply.send(order);
  });

  // Get all orders
  fastify.get('/api/orders', async (request, reply) => {
    const orders = await getAllOrders();
    return reply.send({ orders });
  });

  // Get routing logs
  fastify.get('/api/logs', async (request, reply) => {
    const { orderId } = request.query as { orderId?: string };
    const logs = getLogs(orderId);
    return reply.send({ logs });
  });

  // WebSocket endpoint on same path for live updates
  fastify.get('/api/orders/execute', { websocket: true }, (connection, req) => {
    const socket = connection.socket;
    let subscribedId: string | null = null;

    socket.on('message', (msg: string) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.orderId && typeof data.orderId === 'string') {
          const orderId: string = data.orderId;
          subscribedId = orderId;
          sockets.set(orderId, socket);
          socket.send(JSON.stringify({ status: 'pending', orderId }));
          // forward events
          const handler = (ev: any) => {
            if (socket.readyState === socket.OPEN) {
              socket.send(JSON.stringify({ ...ev, orderId }));
            }
          };
          orderEvents.on(orderId, handler);
          socket.on('close', () => {
            if (subscribedId) {
              orderEvents.off(subscribedId, handler);
              sockets.delete(subscribedId);
            }
          });
        }
      } catch (e) {
        socket.send(JSON.stringify({ error: 'invalid subscribe payload' }));
      }
    });
  });
}
