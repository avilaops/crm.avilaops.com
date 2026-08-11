import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { query, closeDb } from "./db.js";

config({ path: ".env.local" });
config({ path: ".env" });

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "schema.sql");

async function main() {
  const sql = await readFile(schemaPath, "utf8");
  await query(sql);
  await closeDb();
  console.log("Database schema is ready.");
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
