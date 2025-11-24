export type Order = {
  orderId: string;
  tokenIn: string;
  tokenOut: string;
  amount: number;
  type: 'market' | 'limit' | 'sniper';
  status?: string;
  createdAt?: string;
};

export type DexQuote = {
  dex: 'raydium' | 'meteora';
  price: number;
  fee: number;
};

export type SwapResult = {
  txHash: string;
  executedPrice: number;
};
