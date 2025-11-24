import pg from 'pg';
import { Order } from '../types';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/orders';

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
});

export async function initDatabase() {
  try {
    const client = await pool.connect();
    await client.query(`
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
    `);
    client.release();
    console.log('Database initialized');
  } catch (err) {
    console.error('Database init error:', err);
  }
}

export async function saveOrder(order: Order) {
  try {
    await pool.query(
      `INSERT INTO orders (order_id, token_in, token_out, amount, order_type, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (order_id) DO NOTHING`,
      [order.orderId, order.tokenIn, order.tokenOut, order.amount, order.type, 'pending', order.createdAt || new Date().toISOString()]
    );
  } catch (err) {
    console.error('Save order error:', err);
  }
}

export async function updateOrderStatus(
  orderId: string,
  status: string,
  data?: { chosenDex?: string; txHash?: string; executedPrice?: number; error?: string }
) {
  try {
    const updates: string[] = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const values: any[] = [orderId, status];
    let paramIndex = 3;

    if (data?.chosenDex) {
      updates.push(`chosen_dex = $${paramIndex++}`);
      values.push(data.chosenDex);
    }
    if (data?.txHash) {
      updates.push(`tx_hash = $${paramIndex++}`);
      values.push(data.txHash);
    }
    if (data?.executedPrice !== undefined) {
      updates.push(`executed_price = $${paramIndex++}`);
      values.push(data.executedPrice);
    }
    if (data?.error) {
      updates.push(`error_message = $${paramIndex++}`);
      values.push(data.error);
    }

    await pool.query(
      `UPDATE orders SET ${updates.join(', ')} WHERE order_id = $1`,
      values
    );
  } catch (err) {
    console.error('Update order status error:', err);
  }
}

export async function getOrder(orderId: string) {
  try {
    const result = await pool.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
    return result.rows[0] || null;
  } catch (err) {
    console.error('Get order error:', err);
    return null;
  }
}

export async function getAllOrders(limit = 100) {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT $1', [limit]);
    return result.rows;
  } catch (err) {
    console.error('Get all orders error:', err);
    return [];
  }
}

export { pool };
