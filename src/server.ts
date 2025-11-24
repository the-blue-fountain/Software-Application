import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { registerOrderRoutes } from './orders/controller.js';

export function buildServer() {
  const fastify = Fastify({ logger: true });
  
  // Register WebSocket support
  fastify.register(websocket);
  
  // Register API routes
  registerOrderRoutes(fastify);
  
  return fastify;
}
