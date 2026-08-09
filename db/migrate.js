'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Applies db/schema.sql to the target database. schema.sql is fully idempotent
// (CREATE TABLE/INDEX IF NOT EXISTS, INSERT ... ON CONFLICT DO NOTHING,
// DROP TRIGGER IF EXISTS before CREATE), so this is safe to run on every deploy.
//
// Usage:  node db/migrate.js   (or: npm run migrate)
// Run this once before first boot, and after any schema.sql change.

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Exiting.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Mirror db/pool.js — verify the cert only if explicitly asked to and a CA is
  // supplied (needed when connecting to an external DB over the public internet).
  ssl: process.env.NODE_ENV === 'production'
    ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true',
        ca: process.env.DB_SSL_CA || undefined,
      }
    : false,
});

async function main() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('▶ Applying db/schema.sql ...');
  const client = await pool.connect();
  try {
    // schema.sql contains multiple statements; pg runs them together in one
    // implicit transaction when sent as a single query string.
    await client.query(sql);
    console.log('✅ Schema applied successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
