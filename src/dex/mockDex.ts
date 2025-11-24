import { DexQuote, SwapResult, Order } from '../types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockDexRouter {
  basePrice = 100; // arbitrary base price for simulation

  async getRaydiumQuote(tokenIn: string, tokenOut: string, amount: number): Promise<DexQuote> {
    await sleep(200 + Math.random() * 200);
    const price = this.basePrice * (0.98 + Math.random() * 0.04);
    return { dex: 'raydium', price, fee: 0.003 };
  }

  async getMeteoraQuote(tokenIn: string, tokenOut: string, amount: number): Promise<DexQuote> {
    await sleep(200 + Math.random() * 200);
    const price = this.basePrice * (0.97 + Math.random() * 0.05);
    return { dex: 'meteora', price, fee: 0.002 };
  }

  async executeSwap(dex: 'raydium' | 'meteora', order: Order): Promise<SwapResult> {
    // Simulate 2-3s execution time and possible intermittent failure (rarely)
    await sleep(2000 + Math.random() * 1000);
    // Reduced failure rate to 2% to make tests more reliable
    if (Math.random() < 0.02) throw new Error('Simulated network execution failure');
    const executedPrice = this.basePrice * (0.98 + Math.random() * 0.04);
    const txHash = `MOCK_TX_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000)}`;
    return { txHash, executedPrice };
  }
}
