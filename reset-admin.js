'use strict';
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const readline = require('readline');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Exiting.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Same pattern as db/pool.js — see that file for the Internal vs External
  // DB URL reasoning. Defaults to not verifying (matches pool.js default);
  // set DB_SSL_REJECT_UNAUTHORIZED=true + DB_SSL_CA if you need real
  // certificate verification (only matters over the public internet).
  ssl: process.env.NODE_ENV === 'production'
    ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true',
        ca: process.env.DB_SSL_CA || undefined,
      }
    : false,
});

function prompt(question, hidden = false) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hidden) {
      process.stdout.write(question);
      process.stdin.setRawMode(true);
      let input = '';
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', ch => {
        if (ch === '\n' || ch === '\r' || ch === '\u0003') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          rl.close();
          resolve(input);
        } else if (ch === '\u007f') {
          input = input.slice(0, -1);
        } else {
          input += ch;
        }
      });
    } else {
      rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
    }
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   BigOne Growth Lab — Reset Admin    ║');
  console.log('╚══════════════════════════════════════╝\n');

  const username = await prompt('New admin username: ');
  if (!username || username.length < 3) {
    console.error('❌ Username must be at least 3 characters.'); process.exit(1);
  }

  let password = process.env.ADMIN_PASSWORD || '';
  if (!password) {
    password = await prompt('New admin password (min 8 chars): ', true);
  }
  if (!password || password.length < 8) {
    console.error('❌ Password must be at least 8 characters.'); process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM admin_sessions');
    await client.query('DELETE FROM admin_users');
    await client.query(
      'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)',
      [username, passwordHash]
    );
    await client.query('COMMIT');
    console.log(`\n✅ Admin user "${username}" created successfully.`);
    console.log('   All previous sessions have been cleared.');
    console.log('   You can now log in at /admin/login\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to reset admin:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
