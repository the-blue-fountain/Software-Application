import 'dotenv/config';
import { buildServer } from './server.js';
import './orders/worker.js';
import { initDatabase } from './db/database.js';

const fastify = buildServer();

const PORT = Number(process.env.PORT || 3000);

// Initialize database then start server
initDatabase().then(() => {
  fastify.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
    fastify.log.info(`Server listening on ${PORT}`);
  });
});
