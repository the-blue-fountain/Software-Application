export interface LogEntry {
  timestamp: string;
  orderId: string;
  event: string;
  data?: any;
}

const logs: LogEntry[] = [];

export function logRouting(orderId: string, event: string, data?: any) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    orderId,
    event,
    data,
  };
  logs.push(entry);
  console.log(`[ROUTING] ${entry.timestamp} | Order: ${orderId} | ${event}`, data ? JSON.stringify(data) : '');
}

export function getLogs(orderId?: string) {
  if (orderId) {
    return logs.filter(l => l.orderId === orderId);
  }
  return logs;
}

export function clearLogs() {
  logs.length = 0;
}
