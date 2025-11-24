import { Worker, Job } from 'bullmq';
import { MockDexRouter } from '../dex/mockDex.js';
import { connection } from './queue.js';
import EventEmitter from 'events';
import { Order } from '../types.js';
import { saveOrder, updateOrderStatus } from '../db/database.js';
import { logRouting } from '../utils/logger.js';

export const orderEvents = new EventEmitter();

const dex = new MockDexRouter();

export const worker = new Worker(
  'orders',
  async (job: Job) => {
    const order: Order = job.data as Order;
    try {
      // Persist initial order
      await saveOrder(order);
      await updateOrderStatus(order.orderId, 'pending');
      
      // Routing phase
      orderEvents.emit(order.orderId, { status: 'routing', orderId: order.orderId });
      await updateOrderStatus(order.orderId, 'routing');
      logRouting(order.orderId, 'Starting DEX routing', { tokenIn: order.tokenIn, tokenOut: order.tokenOut, amount: order.amount });
      
      const [rQ, mQ] = await Promise.all([
        dex.getRaydiumQuote(order.tokenIn, order.tokenOut, order.amount),
        dex.getMeteoraQuote(order.tokenIn, order.tokenOut, order.amount),
      ]);
      
      // choose best price (higher price for tokenOut per tokenIn)
      const chosen = rQ.price >= mQ.price ? rQ : mQ;
      logRouting(order.orderId, 'DEX comparison completed', {
        raydium: { price: rQ.price, fee: rQ.fee },
        meteora: { price: mQ.price, fee: mQ.fee },
        chosen: chosen.dex,
        reason: `Better price: ${chosen.price.toFixed(4)}`
      });
      
      // Building phase
      orderEvents.emit(order.orderId, { status: 'building', orderId: order.orderId, metadata: { dex: chosen.dex, price: chosen.price } });
      await updateOrderStatus(order.orderId, 'building', { chosenDex: chosen.dex });
      logRouting(order.orderId, 'Building transaction', { dex: chosen.dex });
      
      // Submitted phase
      orderEvents.emit(order.orderId, { status: 'submitted', orderId: order.orderId, metadata: { dex: chosen.dex } });
      await updateOrderStatus(order.orderId, 'submitted');
      logRouting(order.orderId, 'Transaction submitted to network', { dex: chosen.dex });
      
      // Execute swap
      const res = await dex.executeSwap(chosen.dex, order);
      
      // Confirmed
      orderEvents.emit(order.orderId, { status: 'confirmed', orderId: order.orderId, metadata: { txHash: res.txHash, executedPrice: res.executedPrice, dex: chosen.dex } });
      await updateOrderStatus(order.orderId, 'confirmed', { 
        txHash: res.txHash, 
        executedPrice: res.executedPrice 
      });
      logRouting(order.orderId, 'Transaction confirmed', { 
        txHash: res.txHash, 
        executedPrice: res.executedPrice 
      });
      
      return res;
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      orderEvents.emit(order.orderId, { status: 'failed', orderId: order.orderId, metadata: { error: errorMsg } });
      await updateOrderStatus(order.orderId, 'failed', { error: errorMsg });
      logRouting(order.orderId, 'Transaction failed', { error: errorMsg });
      throw err;
    }
  },
  {
    connection,
    concurrency: 10,
    limiter: { max: 100, duration: 60000 },
  }
);

worker.on('failed', (job, err) => {
  // job finished with failure after retries
  if (job && job.data && (job.data as Order).orderId) {
    const id = (job.data as Order).orderId;
    const errorMsg = err?.message || String(err);
    orderEvents.emit(id, { status: 'failed', orderId: id, metadata: { error: errorMsg } });
    updateOrderStatus(id, 'failed', { error: errorMsg });
    logRouting(id, 'Job failed after retries', { error: errorMsg });
  }
});
