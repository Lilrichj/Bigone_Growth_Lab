'use strict';
const pool = require('./pool');

// ─── ORDERS ─────────────────────────────────────────────────────────────────

async function createOrder({ internalId, paystackRef, serviceId, serviceName, platform, link, quantity, email, amount, currency, usdAmount, estimatedDelivery }) {
  const result = await pool.query(
    `INSERT INTO orders
       (internal_id, paystack_ref, service_id, service_name, platform,
        link, quantity, email, amount, currency, usd_amount,
        status, estimated_delivery)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',$12)
     RETURNING *`,
    [internalId, paystackRef, serviceId, serviceName, platform,
     link, quantity, email, amount, currency, usdAmount, estimatedDelivery]
  );
  return result.rows[0];
}

async function getOrderByRef(paystackRef) {
  const result = await pool.query(
    'SELECT * FROM orders WHERE paystack_ref = $1',
    [paystackRef]
  );
  return result.rows[0] || null;
}

async function getOrderById(internalId) {
  const result = await pool.query(
    'SELECT * FROM orders WHERE internal_id = $1',
    [internalId]
  );
  return result.rows[0] || null;
}

async function updateOrderStatus(paystackRef, status, extra = {}) {
  const { exoOrderId, exoError, emailSent } = extra;
  const sets = ['status = $2', 'updated_at = NOW()'];
  const values = [paystackRef, status];
  let idx = 3;

  if (exoOrderId !== undefined) { sets.push(`smmwiz_order_id = $${idx++}`); values.push(exoOrderId); }
  if (exoError !== undefined)   { sets.push(`exo_error = $${idx++}`);       values.push(exoError); }
  if (emailSent !== undefined)  { sets.push(`email_sent = $${idx++}`);       values.push(emailSent); }
  if (status === 'fulfilled')   { sets.push('fulfilled_at = NOW()'); }

  const result = await pool.query(
    `UPDATE orders SET ${sets.join(', ')} WHERE paystack_ref = $1 RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

async function markEmailSent(internalId) {
  await pool.query(
    'UPDATE orders SET email_sent = TRUE WHERE internal_id = $1',
    [internalId]
  );
}

// Orders still 'pending' after `minutes` — used by the reconciliation sweep to
// recover payments where neither the redirect nor the webhook fulfilled the
// order (e.g. customer closed the tab and the webhook signature mismatched).
// Bounded window avoids re-checking ancient abandoned checkouts forever.
async function getStalePendingOrders(minMinutes = 15, maxHours = 24) {
  const result = await pool.query(
    `SELECT * FROM orders
     WHERE status = 'pending'
       AND created_at < NOW() - ($1 || ' minutes')::interval
       AND created_at > NOW() - ($2 || ' hours')::interval
     ORDER BY created_at ASC
     LIMIT 50`,
    [String(minMinutes), String(maxHours)]
  );
  return result.rows;
}

async function getAllOrders({ limit = 25, offset = 0, status = '', search = '' } = {}) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (status) { conditions.push(`status = $${idx++}`); values.push(status); }
  if (search) {
    conditions.push(`(internal_id ILIKE $${idx} OR email ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM orders ${where}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const dataValues = [...values, limit, offset];
  const dataResult = await pool.query(
    `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    dataValues
  );

  return { orders: dataResult.rows, total };
}

async function getDashboardStats() {
  const result = await pool.query(`
    SELECT
      COUNT(*)                                                  AS total,
      COUNT(*) FILTER (WHERE status = 'fulfilled')             AS fulfilled,
      COUNT(*) FILTER (WHERE status = 'pending')               AS pending,
      COUNT(*) FILTER (WHERE status = 'fulfilling')            AS fulfilling,
      COUNT(*) FILTER (WHERE status = 'fulfillment_failed')    AS failed,
      COALESCE(SUM(amount) FILTER (WHERE status = 'fulfilled'), 0) AS total_revenue_ghs,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)       AS orders_today,
      COALESCE(SUM(amount) FILTER (
        WHERE status = 'fulfilled' AND created_at >= CURRENT_DATE
      ), 0) AS revenue_today_ghs
    FROM orders
  `);
  const row = result.rows[0];
  return {
    total:            parseInt(row.total, 10),
    fulfilled:        parseInt(row.fulfilled, 10),
    pending:          parseInt(row.pending, 10),
    fulfilling:       parseInt(row.fulfilling, 10),
    failed:           parseInt(row.failed, 10),
    total_revenue_ghs: parseFloat(row.total_revenue_ghs) / 100,
    orders_today:     parseInt(row.orders_today, 10),
    revenue_today_ghs: parseFloat(row.revenue_today_ghs) / 100,
  };
}

async function getDailyRevenue(days = 30) {
  // Whitelist days to an integer between 1-90 to prevent any injection
  const safeDays = Math.min(Math.max(parseInt(days, 10) || 30, 1), 90);
  const result = await pool.query(`
    SELECT
      TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
      COALESCE(SUM(amount), 0) AS revenue_pesewas
    FROM orders
    WHERE status = 'fulfilled'
      AND created_at >= NOW() - ($1 * INTERVAL '1 day')
    GROUP BY 1
    ORDER BY 1 ASC
  `, [safeDays]);
  return result.rows.map(r => ({
    date: r.date,
    revenue_ghs: parseFloat(r.revenue_pesewas) / 100,
  }));
}

async function getFailedOrders() {
  const result = await pool.query(
    `SELECT * FROM orders WHERE status = 'fulfillment_failed' ORDER BY created_at DESC`
  );
  return result.rows;
}

async function exportAllOrders() {
  const result = await pool.query(
    `SELECT * FROM orders ORDER BY created_at DESC`
  );
  return result.rows;
}

// ─── SERVICES ────────────────────────────────────────────────────────────────

async function getAllServices(activeOnly = true) {
  const where = activeOnly ? 'WHERE is_active = TRUE' : '';
  const result = await pool.query(
    `SELECT * FROM service_map ${where} ORDER BY display_order ASC, platform ASC, name ASC`
  );
  return result.rows;
}

async function getServiceById(internalKey) {
  const result = await pool.query(
    'SELECT * FROM service_map WHERE internal_key = $1',
    [internalKey]
  );
  return result.rows[0] || null;
}

async function upsertService({ internalKey, smmwizId, name, platform, category, minQuantity, maxQuantity, smmwizPricePer1000, markupMultiplier, displayOrder }) {
  const result = await pool.query(
    `INSERT INTO service_map
       (internal_key, smmwiz_id, name, platform, category,
        min_quantity, max_quantity, smmwiz_price_per_1000,
        markup_multiplier, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (internal_key) DO UPDATE SET
       smmwiz_id              = EXCLUDED.smmwiz_id,
       name                   = EXCLUDED.name,
       platform               = EXCLUDED.platform,
       category               = EXCLUDED.category,
       min_quantity           = EXCLUDED.min_quantity,
       max_quantity           = EXCLUDED.max_quantity,
       smmwiz_price_per_1000  = EXCLUDED.smmwiz_price_per_1000,
       markup_multiplier      = EXCLUDED.markup_multiplier,
       display_order          = EXCLUDED.display_order,
       updated_at             = NOW()
     RETURNING *`,
    [internalKey, smmwizId, name, platform, category,
     minQuantity, maxQuantity, smmwizPricePer1000,
     markupMultiplier || 1.45, displayOrder || 0]
  );
  return result.rows[0];
}

async function toggleService(id, isActive) {
  const result = await pool.query(
    'UPDATE service_map SET is_active = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
    [id, isActive]
  );
  return result.rows[0] || null;
}

async function updateServiceMarkup(id, markup) {
  const result = await pool.query(
    'UPDATE service_map SET markup_multiplier = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
    [id, markup]
  );
  return result.rows[0] || null;
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────

async function getSetting(key) {
  const result = await pool.query(
    'SELECT value FROM settings WHERE key = $1',
    [key]
  );
  return result.rows[0] ? result.rows[0].value : null;
}

async function updateSetting(key, value) {
  await pool.query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

// ─── ADMIN ───────────────────────────────────────────────────────────────────

async function getAdminById(adminId) {
  const result = await pool.query(
    'SELECT * FROM admin_users WHERE id = $1',
    [adminId]
  );
  return result.rows[0] || null;
}

async function isUsernameTaken(username, excludeAdminId = null) {
  const result = await pool.query(
    'SELECT id FROM admin_users WHERE username = $1 AND ($2::integer IS NULL OR id <> $2)',
    [username, excludeAdminId]
  );
  return result.rows.length > 0;
}

async function updateAdminCredentials(adminId, { newUsername, newPasswordHash }) {
  const sets = [];
  const values = [adminId];
  let idx = 2;
  if (newUsername)     { sets.push(`username = $${idx++}`);      values.push(newUsername); }
  if (newPasswordHash) { sets.push(`password_hash = $${idx++}`); values.push(newPasswordHash); }
  if (!sets.length) throw new Error('No credential fields to update');
  const result = await pool.query(
    `UPDATE admin_users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

async function invalidateAdminSessions(adminId) {
  await pool.query('DELETE FROM admin_sessions WHERE admin_id = $1', [adminId]);
}

async function cleanExpiredSessions() {
  const result = await pool.query('DELETE FROM admin_sessions WHERE expires_at < NOW() RETURNING id');
  return result.rowCount;
}

// ─── AUDIT LOG ───────────────────────────────────────────────────────────────

async function logAdminAction(adminId, action, details, ipAddress) {
  // Best-effort logging — a logging failure should never block the actual
  // admin action, so callers should not await-fail on this.
  await pool.query(
    `INSERT INTO admin_audit_log (admin_id, action, details, ip_address) VALUES ($1, $2, $3, $4)`,
    [adminId, action, details || null, ipAddress || null]
  );
}

async function getAuditLog({ limit = 50, offset = 0 } = {}) {
  const result = await pool.query(
    `SELECT l.*, a.username FROM admin_audit_log l
     LEFT JOIN admin_users a ON a.id = l.admin_id
     ORDER BY l.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}

module.exports = {
  createOrder,
  getOrderByRef,
  getOrderById,
  updateOrderStatus,
  markEmailSent,
  getStalePendingOrders,
  getAllOrders,
  getDashboardStats,
  getDailyRevenue,
  getFailedOrders,
  exportAllOrders,
  getAllServices,
  getServiceById,
  upsertService,
  toggleService,
  updateServiceMarkup,
  getSetting,
  updateSetting,
  getAdminById,
  isUsernameTaken,
  updateAdminCredentials,
  invalidateAdminSessions,
  cleanExpiredSessions,
  logAdminAction,
  getAuditLog,
};
