'use strict';
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Prefer Render's Internal Database URL (private network, same region) —
  // traffic never leaves Render's infrastructure, so the cert-trust gap below
  // is largely moot. If you must use the External URL (public internet),
  // set DB_SSL_REJECT_UNAUTHORIZED=true and supply DB_SSL_CA (Render's CA
  // bundle) so the connection is actually verified rather than merely encrypted.
  ssl: process.env.NODE_ENV === 'production'
    ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true',
        ca: process.env.DB_SSL_CA || undefined,
      }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.connect()
  .then(client => {
    return client.query('SELECT NOW()').then(res => {
      client.release();
      console.log('✅ PostgreSQL connected:', res.rows[0].now);
    });
  })
  .catch(err => {
    console.error('❌ PostgreSQL connection failed:', err.message);
  });

module.exports = pool;
