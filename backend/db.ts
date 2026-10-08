import { config } from "dotenv";
import pg, { type QueryResultRow, type PoolClient } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
const transactionContext = new AsyncLocalStorage<PoolClient>();

config({ path: ".env.local" });
config({ path: ".env" });

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return (transactionContext.getStore() ?? pool).query<T>(text, params);
}

export async function closeDb() {
  await pool.end();
}

export async function transaction<T>(work: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await transactionContext.run(client, work);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}
