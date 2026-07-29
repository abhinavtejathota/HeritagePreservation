// server/db.js
// require('./db');
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

pool.on("connect", () => {
  console.log("Connected to PostgreSQL");
});

module.exports = pool;
