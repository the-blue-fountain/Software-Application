-- Order execution history table
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(255) UNIQUE NOT NULL,
  token_in VARCHAR(100) NOT NULL,
  token_out VARCHAR(100) NOT NULL,
  amount DECIMAL NOT NULL,
  order_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  chosen_dex VARCHAR(50),
  tx_hash VARCHAR(255),
  executed_price DECIMAL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
