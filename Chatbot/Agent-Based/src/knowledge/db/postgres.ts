import { Pool } from "pg";
import { env } from "../../config/env";

export const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
});

pool.on("connect", () => {
  console.log("Connected to PostgreSQL");
});

pool.on("error", (err) => {
  console.error("PostgreSQL error", err);
  process.exit(1);
});
