import { Queue, QueueScheduler } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export const ordersQueue = new Queue('orders', {
  connection,
});

// Required for delayed jobs/retries
new QueueScheduler('orders', { connection });

export { connection };
