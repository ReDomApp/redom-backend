import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("connect", () => {
  console.log("✅ Connected to Neon PostgreSQL");
});

pool.on("error", (err) => {
  console.error("❌ Database connection error:", err);
});

export const db = drizzle(pool);
export { pool };