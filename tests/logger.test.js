import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logRouting, getLogs, clearLogs } from '../src/utils/logger';
describe('Routing Logger', () => {
    beforeEach(() => {
        clearLogs();
    });
    afterEach(() => {
        clearLogs();
    });
    it('should log routing events with timestamp and orderId', () => {
        logRouting('order-1', 'routing_started', { dex: 'raydium' });
        const logs = getLogs('order-1');
        expect(logs).toHaveLength(1);
        expect(logs[0].orderId).toBe('order-1');
        expect(logs[0].event).toBe('routing_started');
        expect(logs[0].timestamp).toBeDefined();
    });
    it('should filter logs by orderId', () => {
        logRouting('order-1', 'event-1');
        logRouting('order-2', 'event-2');
        logRouting('order-1', 'event-3');
        const order1Logs = getLogs('order-1');
        expect(order1Logs).toHaveLength(2);
        expect(order1Logs.every(l => l.orderId === 'order-1')).toBe(true);
    });
    it('should return all logs when no orderId specified', () => {
        logRouting('order-1', 'event-1');
        logRouting('order-2', 'event-2');
        const allLogs = getLogs();
        expect(allLogs).toHaveLength(2);
    });
    it('should store additional data with log entries', () => {
        const data = { raydium: 100.5, meteora: 99.8, chosen: 'raydium' };
        logRouting('order-1', 'dex_comparison', data);
        const logs = getLogs('order-1');
        expect(logs[0].data).toEqual(data);
    });
});
