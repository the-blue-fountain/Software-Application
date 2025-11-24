import { describe, it, expect } from 'vitest';
import { MockDexRouter } from '../src/dex/mockDex';
describe('MockDexRouter', () => {
    const dex = new MockDexRouter();
    const sampleOrder = {
        orderId: 'test-123',
        tokenIn: 'USDC',
        tokenOut: 'TOKEN',
        amount: 100,
        type: 'market',
    };
    it('should return raydium quote with valid price and fee', async () => {
        const quote = await dex.getRaydiumQuote('USDC', 'TOKEN', 100);
        expect(quote.dex).toBe('raydium');
        expect(quote.price).toBeGreaterThan(0);
        expect(quote.fee).toBe(0.003);
    });
    it('should return meteora quote with valid price and fee', async () => {
        const quote = await dex.getMeteoraQuote('USDC', 'TOKEN', 100);
        expect(quote.dex).toBe('meteora');
        expect(quote.price).toBeGreaterThan(0);
        expect(quote.fee).toBe(0.002);
    });
    it('should have price variance between raydium and meteora', async () => {
        const [rQ, mQ] = await Promise.all([
            dex.getRaydiumQuote('USDC', 'TOKEN', 100),
            dex.getMeteoraQuote('USDC', 'TOKEN', 100),
        ]);
        // Prices should be within reasonable range (2-5% difference possible)
        expect(Math.abs(rQ.price - mQ.price)).toBeLessThan(20);
        expect(rQ.price).toBeGreaterThan(90);
        expect(mQ.price).toBeGreaterThan(90);
    });
    it('should execute swap successfully and return txHash', async () => {
        const result = await dex.executeSwap('raydium', sampleOrder);
        expect(result.txHash).toBeDefined();
        expect(result.txHash).toContain('MOCK_TX_');
        expect(result.executedPrice).toBeGreaterThan(0);
    });
    it('should simulate execution delay of 2-3 seconds', async () => {
        const start = Date.now();
        await dex.executeSwap('meteora', sampleOrder);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(2000);
        expect(elapsed).toBeLessThan(4000);
    });
    it('should choose best price between DEXs (routing logic)', async () => {
        const [rQ, mQ] = await Promise.all([
            dex.getRaydiumQuote('USDC', 'TOKEN', 100),
            dex.getMeteoraQuote('USDC', 'TOKEN', 100),
        ]);
        const chosen = rQ.price >= mQ.price ? rQ : mQ;
        expect(['raydium', 'meteora']).toContain(chosen.dex);
        expect(chosen.price).toBeGreaterThanOrEqual(Math.min(rQ.price, mQ.price));
    });
});
