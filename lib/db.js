// Lifted from surepath/db.js. Single pg.Pool exposed; callers use pool.query(sql, params) directly.
// No ORM. Connection from DATABASE_URL.

const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error:', err);
});

module.exports = { pool };
