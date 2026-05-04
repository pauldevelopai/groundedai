// Lifted from holly/server/db/migrate.js. Reads .sql files from db/migrations/,
// tracks completed in a `migrations` table, BEGIN/COMMIT/ROLLBACK per file.
// No Knex/TypeORM. Run via: npm run migrate

const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getApplied() {
  const { rows } = await pool.query('SELECT filename FROM migrations');
  return new Set(rows.map((r) => r.filename));
}

async function applyMigration(filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filepath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO migrations (filename) VALUES ($1)', [filename]);
    await client.query('COMMIT');
    console.log(`✓ ${filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`✗ ${filename}\n${err.message}`);
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  await ensureMigrationsTable();
  const applied = await getApplied();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('No pending migrations.');
    return;
  }

  console.log(`Applying ${pending.length} migration(s):`);
  for (const f of pending) {
    await applyMigration(f);
  }

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
