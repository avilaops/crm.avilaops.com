import { config } from "dotenv";
import pg, { type QueryResultRow } from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

export async function closeDb() {
  await pool.end();
}
