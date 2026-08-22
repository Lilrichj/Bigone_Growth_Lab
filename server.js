'use strict';
require('dotenv').config();
const express       = require('express');
const helmet        = require('helmet');
const cors          = require('cors');
const cookieParser  = require('cookie-parser');
const crypto        = require('crypto');
const path          = require('path');
const rateLimit     = require('express-rate-limit');
const bcrypt        = require('bcryptjs');
const pool          = require('./db/pool');
const Q             = require('./db/queries');
const { sendOrderConfirmation, sendContactEmail } = require('./services/email');

// ─── PROCESS-LEVEL SAFETY NET ─────────────────────────────────────────────────
// Node terminates the process on an unhandled promise rejection by default
// (Node 15+). A single un-awaited DB or email call rejecting must NOT take the
// whole site down — log it and keep serving. Fire-and-forget calls below also
// carry their own .catch(); this is the last line of defence.
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason instanceof Error ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err && (err.stack || err.message));
});

// ─── STARTUP GUARD ────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const required = [
    'KORAPAY_SECRET_KEY','KORAPAY_PUBLIC_KEY','KORAPAY_ENCRYPTION_KEY',
    'SMMWIZ_API_KEY','DATABASE_URL','ADMIN_SESSION_SECRET',
    'RECAPTCHA_SECRET_KEY'
  ];
  for (const key of required) {
    if (!process.env[key]) { console.error(`FATAL: Missing env var: ${key}`); process.exit(1); }
  }
  if (process.env.ADMIN_SESSION_SECRET === 'change-this-secret') {
    console.error('FATAL: ADMIN_SESSION_SECRET must not be the default value.'); process.exit(1);
  }
}

const IS_PROD  = process.env.NODE_ENV === 'production';
const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const CONFIG = {
  KORA_SECRET:        process.env.KORAPAY_SECRET_KEY     || '',
  KORA_PUBLIC:        process.env.KORAPAY_PUBLIC_KEY     || '',
  KORA_ENC_KEY:       process.env.KORAPAY_ENCRYPTION_KEY || '',
  SMMWIZ_KEY:         process.env.SMMWIZ_API_KEY         || '',
  RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY     || '',
  BASE_URL,
  CURRENCY:           process.env.CURRENCY     || 'GHS',
  USD_TO_GHS_ENV:     parseFloat(process.env.USD_TO_GHS  || '15.5'),
  SESSION_SECRET:     process.env.ADMIN_SESSION_SECRET   || 'dev-secret',
  PORT:               parseInt(process.env.PORT || '3000', 10),
};

const KORA_BASE = 'https://api.korapay.com/merchant/api/v1';
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY || '';
const RECAPTCHA_ENABLED = !!RECAPTCHA_SECRET;

const MARKUP = {
  followers:1.55, likes:1.45, views:1.35,
  members:1.55, comments:1.45, shares:1.40, other:1.40,
};

// ─── INPUT LIMITS ─────────────────────────────────────────────────────────────
const LIMITS = {
  email:    254,
  name:     100,
  message:  2000,
  link:     500,
  username: 50,
  password: 200,
  serviceId:80,
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function generateInternalId() {
  return 'BOG-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}
function generateReference() {
  return 'BOG-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Validate that a link is a real http/https URL (no javascript:, data:, etc.)
function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_) { return false; }
}

// Safe JSON error response — never leak stack traces
function sendError(res, status, message) {
  res.status(status).json({ success: false, error: message });
}

// ─── RECAPTCHA ────────────────────────────────────────────────────────────────
async function verifyRecaptcha(token) {
  if (!RECAPTCHA_ENABLED) return true; // Skip in dev if key not set
  if (!token) return false;
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: RECAPTCHA_SECRET, response: token }).toString(),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    // Require score >= 0.5 for reCAPTCHA v3
    return data.success === true && (data.score === undefined || data.score >= 0.5);
  } catch (err) {
    console.error('reCAPTCHA verify error:', err.message);
    // In production, a verification error should not silently let the
    // request through — fail closed. Only fail open in non-production so
    // local/dev work isn't blocked by network issues reaching Google.
    return !IS_PROD;
  }
}

// ─── SMMWIZ ───────────────────────────────────────────────────────────────────
const SMMWIZ_URL = 'https://smmwiz.com/api/v2';

async function withRetry(fn, maxAttempts = 3, label = 'op') {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[${label}] attempt ${attempt}/${maxAttempts}`);
      const r = await fn();
      console.log(`[${label}] success`);
      return r;
    } catch (err) {
      lastErr = err;
      console.error(`[${label}] attempt ${attempt} failed: ${err.message}`);
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  throw lastErr;
}

async function smmwizRequest(params) {
  const body = new URLSearchParams({ key: CONFIG.SMMWIZ_KEY, ...params });
  const res  = await fetch(SMMWIZ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15000), // 15s timeout
  });
  if (!res.ok) throw new Error(`SMMWiz HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`SMMWiz error: ${data.error}`);
  return data;
}

let _smmwizCache = null, _smmwizCachedAt = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000;

async function getSmmwizServices(forceRefresh = false) {
  if (!forceRefresh && _smmwizCache && (Date.now() - _smmwizCachedAt) < CACHE_TTL) return _smmwizCache;
  const data = await withRetry(() => smmwizRequest({ action: 'services' }), 3, 'smmwiz-services');
  _smmwizCache = Array.isArray(data) ? data : [];
  _smmwizCachedAt = Date.now();
  return _smmwizCache;
}

async function getLiveRate() {
  try { const val = await Q.getSetting('usd_to_ghs_rate'); if (val) return parseFloat(val); } catch (_) {}
  return CONFIG.USD_TO_GHS_ENV;
}

async function fulfillOrder(order) {
  const service = await Q.getServiceById(order.service_id);
  if (!service) throw new Error(`Service not found: ${order.service_id}`);
  const result = await withRetry(
    () => smmwizRequest({ action:'add', service:service.smmwiz_id, link:order.link, quantity:order.quantity }),
    3, `fulfill-${order.internal_id}`
  );
  if (!result.order) throw new Error('SMMWiz returned no order ID');
  return String(result.order);
}

// Fire-and-forget confirmation email after a successful fulfillment. Every
// promise in the chain is caught here so a transient DB/email failure can never
// bubble up as an unhandled rejection (which would crash the process).
function sendConfirmationEmail(internalId) {
  Q.getOrderById(internalId)
    .then(o => {
      if (!o) return;
      return sendOrderConfirmation(o)
        .then(sent => { if (sent) return Q.markEmailSent(internalId); });
    })
    .catch(err => console.error(`[email] confirmation failed for ${internalId}:`, err.message));
}

// ─── KORAPAY ──────────────────────────────────────────────────────────────────
async function korapayInitialize({ reference, amount, email, internalId, serviceId, platform }) {
  const res = await fetch(`${KORA_BASE}/charges/initialize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CONFIG.KORA_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reference, amount, currency: 'GHS',
      customer: { email },
      notification_url: `${CONFIG.BASE_URL}/api/payment/webhook`,
      redirect_url:     `${CONFIG.BASE_URL}/payment/callback`,
      channels: ['mobile_money', 'card', 'bank_transfer'],
      metadata: { internalId, serviceId, platform },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Korapay HTTP ${res.status}`);
  const data = await res.json();
  if (!data.status) throw new Error(data.message || 'Korapay initialization failed');
  return data.data;
}

async function korapayVerify(reference) {
  const res = await fetch(
    `${KORA_BASE}/charges/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${CONFIG.KORA_SECRET}` },
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!res.ok) throw new Error(`Korapay verify HTTP ${res.status}`);
  return res.json();
}

function verifyKorapaySignature(rawBody, signature) {
  if (!CONFIG.KORA_ENC_KEY || !signature) return false;
  const hash = crypto.createHmac('sha256', CONFIG.KORA_ENC_KEY).update(rawBody).digest('hex');
  // Fail closed on any length mismatch rather than coercing the signature to fit.
  if (signature.length !== hash.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(signature, 'hex'));
  } catch (_) {
    // signature wasn't valid hex
    return false;
  }
}

// ─── ADMIN SESSION ────────────────────────────────────────────────────────────
async function getAdminFromCookie(req) {
  const sessionId = req.cookies && req.cookies.admin_session;
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length !== 64) return null;
  const result = await pool.query(
    `SELECT s.admin_id, u.username
     FROM admin_sessions s
     JOIN admin_users u ON u.id = s.admin_id
     WHERE s.id = $1 AND s.expires_at > NOW()`,
    [sessionId]
  );
  return result.rows[0] || null;
}

async function requireAdmin(req, res, next) {
  const admin = await getAdminFromCookie(req).catch(() => null);
  if (!admin) return res.redirect('/admin/login');
  req.admin = admin; next();
}

async function requireAdminAPI(req, res, next) {
  const admin = await getAdminFromCookie(req).catch(() => null);
  if (!admin) return sendError(res, 401, 'Unauthorized');
  req.admin = admin; next();
}

// Step-up auth for irreversible actions (bulk delete, single delete). A valid
// session alone isn't enough here — require the current password again, the
// same pattern already used by /admin/change-credentials.
async function requireStepUpPassword(req, res, next) {
  const currentPassword = (req.body.currentPassword || '').slice(0, LIMITS.password);
  if (!currentPassword) return sendError(res, 400, 'Current password is required to confirm this action');
  try {
    const admin = await Q.getAdminById(req.admin.admin_id);
    if (!admin) return sendError(res, 404, 'Admin not found');
    const match = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!match) return sendError(res, 401, 'Current password is incorrect');
    next();
  } catch (err) {
    sendError(res, 500, 'Failed to verify password');
  }
}
const destructiveActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { success: false, error: 'Too many attempts. Please wait 15 minutes.' },
});

async function claimOrder(reference) {
  const result = await pool.query(
    `UPDATE orders SET status='fulfilling', updated_at=NOW()
     WHERE paystack_ref=$1 AND status='pending' RETURNING *`,
    [reference]
  );
  return result.rows[0] || null;
}

// Defence-in-depth: confirm the amount actually paid isn't LESS than what the
// order was created for, and that the currency matches. The amount is set
// server-side at initialize and Korapay controls it on the hosted checkout, so
// tampering is already hard — this catches underpayment / currency mismatches.
// Deliberately only blocks UNDERpayment: Korapay reports amounts in the major
// unit (GHS), and orders store pesewas, so we scale ×100. If that unit
// assumption were ever wrong, a mismatch would read as an OVERpayment and pass
// through — never a false rejection of a legitimate order.
function checkPaidAmount(paidAmount, paidCurrency, order) {
  const expectedPesewas = Number(order.amount);
  const paidPesewas     = Math.round(Number(paidAmount) * 100);
  if (!Number.isFinite(paidPesewas)) return { ok: true }; // unparseable — don't block, just fulfill
  if (paidCurrency && String(paidCurrency).toUpperCase() !== String(order.currency || 'GHS').toUpperCase())
    return { ok: false, reason: `currency mismatch: paid ${paidCurrency}, expected ${order.currency}` };
  if (paidPesewas < expectedPesewas)
    return { ok: false, reason: `underpaid: ${paidPesewas} < ${expectedPesewas} pesewas` };
  return { ok: true };
}

// ─── APP SETUP ────────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);

// ── Security Headers via Helmet ───────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'www.google.com', 'www.gstatic.com'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc:     ["'self'", 'fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'https:'],
      connectSrc:  ["'self'", 'https://www.google.com', 'https://api.korapay.com'],
      frameSrc:    ["'self'", 'https://www.google.com'],  // reCAPTCHA uses an iframe
      objectSrc:   ["'none'"],
      ...(IS_PROD ? { upgradeInsecureRequests: [] } : {}),
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
// Allow both the apex and the www. form of BASE_URL so an API call isn't
// rejected just because the visitor landed on the non-canonical host.
function originVariants(url) {
  try {
    const u = new URL(url);
    const alt = u.host.startsWith('www.') ? u.host.slice(4) : `www.${u.host}`;
    return [`${u.protocol}//${u.host}`, `${u.protocol}//${alt}`];
  } catch (_) {
    return [url];
  }
}

const allowedOrigins = IS_PROD
  ? originVariants(CONFIG.BASE_URL)
  : [CONFIG.BASE_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    // Pass `false` (a clean deny with no CORS headers) rather than throwing an
    // Error, which the global handler would turn into a confusing 500.
    return cb(null, allowedOrigins.includes(origin));
  },
  credentials: true,
}));

app.use(cookieParser());

// Raw body for webhook signature verification — MUST come before express.json()
app.use('/api/payment/webhook', express.raw({ type: 'application/json', limit: '100kb' }));

// Body size limits to prevent payload flooding
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// ── Request Logger ────────────────────────────────────────────────────────────
const SKIP_EXTS = new Set([
  '.css','.js','.html','.png','.jpg','.jpeg',
  '.gif','.ico','.svg','.woff','.woff2','.ttf','.eot','.map'
]);
app.use((req, res, next) => {
  if (!SKIP_EXTS.has(path.extname(req.path).toLowerCase())) {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} [${req.ip}]`);
  }
  next();
});

// ── Rate Limiters ─────────────────────────────────────────────────────────────
const generalLimiter    = rateLimit({ windowMs: 15*60*1000, max: 100, standardHeaders: true, legacyHeaders: false });
const paymentLimiter    = rateLimit({ windowMs: 60*60*1000, max: 10,  message: { success: false, error: 'Too many payment attempts. Please try again in an hour.' } });
const adminLoginLimiter = rateLimit({ windowMs: 15*60*1000, max: 5,   message: { success: false, error: 'Too many login attempts. Please wait 15 minutes.' } });
const contactLimiter    = rateLimit({ windowMs: 60*60*1000, max: 5,   message: { success: false, error: 'Too many messages sent. Please try again later.' } });
const adminApiLimiter   = rateLimit({ windowMs: 60*1000, max: 60, message: { success: false, error: 'Too many requests, please slow down.' } });
// /payment/callback lives outside /api/, so generalLimiter doesn't cover it.
// Each hit triggers an outbound Korapay verify call — throttle it. A real user
// returning from checkout hits this once or twice; 30/15min is generous.
const callbackLimiter   = rateLimit({ windowMs: 15*60*1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api/', generalLimiter);
app.use('/admin/api/', adminApiLimiter);

// ── Static Files ──────────────────────────────────────────────────────────────
// IMPORTANT: only ./public is served. Do not point this at __dirname directly —
// that would serve every file in the project (server code, SQL, scripts) to
// anyone who requests it by name. Browser-facing files (index.html, track.html,
// style.css, app.js, favicons) must live in ./public. Everything else (db/,
// services/, schema.sql, seed-services.sql, reset-admin.js, package.json)
// stays outside it and is therefore unreachable over HTTP.
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  dotfiles: 'deny',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));
// dashboard.html is only ever served through the authenticated
// /admin/dashboard route below — never directly as a static file.
app.use('/admin', (req, res, next) => {
  if (req.path === '/dashboard.html') return res.status(404).send('Not found');
  next();
});
app.use('/admin', express.static(path.join(__dirname, 'admin'), { index: false, dotfiles: 'deny' }));

// CSRF double-submit check. Applies to every state-changing request under
// /admin (both /admin/... and /admin/api/...) except /admin/login — no
// session exists yet at login time, so there's no CSRF cookie to compare
// against. The token itself is issued at login and refreshed in
// /admin/api/me above; the frontend must echo it back as X-CSRF-Token.
app.use('/admin', (req, res, next) => {
  const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
  if (!isMutating || req.path === '/login') return next();
  const cookieToken = req.cookies && req.cookies.csrf_token;
  const headerToken = req.get('X-CSRF-Token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return sendError(res, 403, 'Invalid or missing CSRF token. Please refresh the page and try again.');
  }
  next();
});

// ── Page Routes ───────────────────────────────────────────────────────────────
app.get('/',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/track',(req, res) => res.sendFile(path.join(__dirname, 'public', 'track.html')));
app.get('/admin',           (req, res) => res.redirect('/admin/dashboard'));
app.get('/admin/login',     (req, res) => res.sendFile(path.join(__dirname, 'admin', 'login.html')));
app.get('/admin/dashboard', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'admin', 'dashboard.html')));

// ─── PUBLIC API: STATS (homepage counters) ────────────────────────────────────
app.get('/api/stats/public', async (req, res) => {
  // Base numbers added to real DB counts so counters look credible from day one.
  // These represent orders/customers before this tracking system was in place.
  const BASE_ORDERS    = 1247;
  const BASE_CUSTOMERS = 893;

  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'fulfilled') AS orders_completed,
        COUNT(DISTINCT email) FILTER (WHERE status = 'fulfilled') AS happy_customers
      FROM orders
    `);
    const row          = result.rows[0];
    const serviceCount = await pool.query(`SELECT COUNT(*) FROM service_map WHERE is_active = TRUE`);
    res.json({
      success:           true,
      ordersCompleted:   BASE_ORDERS    + parseInt(row.orders_completed,  10),
      happyCustomers:    BASE_CUSTOMERS + parseInt(row.happy_customers,   10),
      servicesAvailable: parseInt(serviceCount.rows[0].count, 10),
      avgDelivery:       '1–8 hours',
    });
  } catch (err) {
    console.error('GET /api/stats/public:', err.message);
    res.json({
      success:           true,
      ordersCompleted:   BASE_ORDERS,
      happyCustomers:    BASE_CUSTOMERS,
      servicesAvailable: 0,
      avgDelivery:       '1–8 hours',
    });
  }
});

// ─── PUBLIC API: CONFIG ───────────────────────────────────────────────────────
app.get('/api/config', async (req, res) => {
  try {
    const [services, rate, whatsappNumber] = await Promise.all([
      Q.getAllServices(true),
      getLiveRate(),
      Q.getSetting('whatsapp_number').catch(() => ''),
    ]);
    const mapped = services.map(s => {
      const markup    = parseFloat(s.markup_multiplier) || MARKUP[s.category] || 1.40;
      const pricePerK = parseFloat(s.smmwiz_price_per_1000) * markup * rate;
      return {
        id:        s.internal_key,
        name:      s.name,
        platform:  s.platform,
        category:  s.category,
        minQty:    s.min_quantity,
        maxQty:    s.max_quantity,
        pricePerK: parseFloat(pricePerK.toFixed(2)),
        currency:  'GHS',
      };
    });
    res.json({
      success:           true,
      korapayPublicKey:  CONFIG.KORA_PUBLIC,
      recaptchaSiteKey:  CONFIG.RECAPTCHA_SITE_KEY,
      whatsappNumber:    whatsappNumber || '',
      currency:          CONFIG.CURRENCY,
      usdToGhs:          rate,
      services:          mapped,
    });
  } catch (err) {
    console.error('GET /api/config:', err.message);
    sendError(res, 500, 'Failed to load configuration');
  }
});

// ─── ORDER STATUS ─────────────────────────────────────────────────────────────
app.get('/api/order/status', async (req, res) => {
  const raw = (req.query.order || '').trim().toUpperCase();
  // Validate format — must match BOG-XXXXXXXXXX pattern
  if (!raw || !/^BOG-[A-F0-9]{10}$/.test(raw)) {
    return sendError(res, 400, 'Invalid Order ID format. Expected: BOG-XXXXXXXXXX');
  }
  try {
    const order = await Q.getOrderById(raw);
    if (!order) return sendError(res, 404, 'Order not found. Please check your Order ID.');
    res.json({
      success:            true,
      id:                 order.internal_id,
      status:             order.status,
      // NOTE: exoOrderId (SMMWiz order ID) intentionally excluded from public response
      service_name:       order.service_name,
      platform:           order.platform,
      quantity:           order.quantity,
      link:               order.link,
      currency:           order.currency,
      amount:             order.amount,
      created_at:         order.created_at,
      estimated_delivery: order.estimated_delivery,
      // Only expose error message if fulfillment failed, never internal IDs
      error: order.status === 'fulfillment_failed' ? 'Order fulfillment failed. Please contact support with your Order ID.' : null,
    });
  } catch (err) {
    console.error('GET /api/order/status:', err.message);
    sendError(res, 500, 'Failed to fetch order status');
  }
});

// ─── CONTACT FORM ─────────────────────────────────────────────────────────────
app.post('/api/contact', contactLimiter, async (req, res) => {
  const name      = (req.body.name      || '').trim().slice(0, LIMITS.name);
  const email     = (req.body.email     || '').trim().slice(0, LIMITS.email);
  const message   = (req.body.message   || '').trim().slice(0, LIMITS.message);
  const recaptcha = req.body.recaptchaToken || '';

  if (!name)    return sendError(res, 400, 'Name is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendError(res, 400, 'Valid email address is required');
  if (message.length < 10) return sendError(res, 400, 'Message must be at least 10 characters');

  if (!(await verifyRecaptcha(recaptcha)))
    return sendError(res, 400, 'Security check failed. Please refresh the page and try again.');

  try {
    await sendContactEmail({ name, email, message });
    res.json({ success: true, message: "Message sent! We'll get back to you within 2 hours." });
  } catch (err) {
    console.error('Contact email error:', err.message);
    sendError(res, 500, 'Failed to send message. Please email us directly at bigonegrowthlab@gmail.com');
  }
});

// ─── PAYMENT: INITIALIZE ──────────────────────────────────────────────────────
app.post('/api/payment/initialize', paymentLimiter, async (req, res) => {
  const serviceId     = (req.body.serviceId     || '').trim().slice(0, LIMITS.serviceId);
  const link          = (req.body.link          || '').trim().slice(0, LIMITS.link);
  const email         = (req.body.email         || '').trim().slice(0, LIMITS.email);
  const quantity      = req.body.quantity;
  const recaptchaToken = req.body.recaptchaToken || '';

  if (!serviceId || !link || !quantity || !email)
    return sendError(res, 400, 'serviceId, link, quantity and email are all required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return sendError(res, 400, 'Valid email address is required');
  if (!isValidUrl(link))
    return sendError(res, 400, 'Link must be a valid https:// URL (e.g. https://www.tiktok.com/@yourhandle)');

  // reCAPTCHA verification
  if (!(await verifyRecaptcha(recaptchaToken)))
    return sendError(res, 400, 'Security check failed. Please refresh the page and try again.');

  try {
    const service = await Q.getServiceById(serviceId);
    if (!service || !service.is_active)
      return sendError(res, 404, 'Service not found or is currently inactive');

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < service.min_quantity || qty > service.max_quantity)
      return sendError(res, 400, `Quantity must be between ${Number(service.min_quantity).toLocaleString()} and ${Number(service.max_quantity).toLocaleString()}`);

    // ── Duplicate / Fraud Detection ─────────────────────────────────────────
    // Block if the same email placed an identical order for the same service
    // within the last 10 minutes (catches double-clicks and replay attacks)
    const recentDupe = await pool.query(
      `SELECT id FROM orders
       WHERE email = $1 AND service_id = $2 AND quantity = $3
         AND status IN ('pending','fulfilling','fulfilled')
         AND created_at > NOW() - INTERVAL '10 minutes'
       LIMIT 1`,
      [email, serviceId, parseInt(quantity, 10)]
    );
    if (recentDupe.rows.length > 0) {
      return sendError(res, 429, 'A similar order was placed very recently. Please wait a few minutes before ordering again, or contact support if this is unexpected.');
    }

    const rate      = await getLiveRate();
    const markup    = parseFloat(service.markup_multiplier) || MARKUP[service.category] || 1.40;
    const pricePerK = parseFloat(service.smmwiz_price_per_1000) * markup * rate;
    const totalGHS  = parseFloat(((pricePerK / 1000) * qty).toFixed(2));

    if (totalGHS < 10.00)
      return sendError(res, 400, `Minimum payment is GHS 10.00. Your total is GHS ${totalGHS.toFixed(2)}. Please increase your quantity.`);

    const usdAmount     = parseFloat(service.smmwiz_price_per_1000) * qty / 1000;
    const amountPesewas = Math.round(totalGHS * 100);
    const internalId    = generateInternalId();
    const reference     = generateReference();

    await Q.createOrder({
      internalId, paystackRef: reference,
      serviceId, serviceName: service.name, platform: service.platform,
      link, quantity: qty, email,
      amount: amountPesewas, currency: 'GHS', usdAmount,
      estimatedDelivery: '1–8 hours',
    });

    const koraData = await korapayInitialize({
      reference, amount: totalGHS, email, internalId, serviceId, platform: service.platform,
    });

    res.json({ success: true, paymentUrl: koraData.checkout_url, reference, internalId });
  } catch (err) {
    console.error('Payment init error:', err.message);
    sendError(res, 500, 'Payment initialization failed. Please try again.');
  }
});

// ─── PAYMENT: CALLBACK ────────────────────────────────────────────────────────
app.get('/payment/callback', callbackLimiter, async (req, res) => {
  const ref = (req.query.reference || req.query.trxref || '').trim();
  if (!ref) return res.redirect('/?payment=failed');

  try {
    const verify = await korapayVerify(ref);
    if (!verify.status || !verify.data || verify.data.status !== 'success')
      return res.redirect('/?payment=failed');

    const claimed = await claimOrder(ref);
    if (!claimed) {
      const existing = await Q.getOrderByRef(ref);
      return res.redirect(existing ? `/track?orderId=${existing.internal_id}` : '/?payment=failed');
    }

    const amountCheck = checkPaidAmount(verify.data.amount, verify.data.currency, claimed);
    if (!amountCheck.ok) {
      console.error(`[payment] callback amount check failed for ${ref}: ${amountCheck.reason}`);
      await Q.updateOrderStatus(ref, 'fulfillment_failed', { exoError: `Payment amount check failed (${amountCheck.reason}) — held for manual review` });
      return res.redirect(`/track?orderId=${claimed.internal_id}`);
    }

    try {
      const exoOrderId = await fulfillOrder(claimed);
      await Q.updateOrderStatus(ref, 'fulfilled', { exoOrderId });
      sendConfirmationEmail(claimed.internal_id);
    } catch (fulfillErr) {
      console.error('Fulfillment failed (callback):', fulfillErr.message);
      await Q.updateOrderStatus(ref, 'fulfillment_failed', { exoError: fulfillErr.message });
    }

    const order = await Q.getOrderByRef(ref);
    res.redirect(`/track?orderId=${order ? order.internal_id : ''}`);
  } catch (err) {
    console.error('Callback error:', err.message);
    res.redirect('/?payment=failed');
  }
});

// ─── PAYMENT: WEBHOOK ─────────────────────────────────────────────────────────
app.post('/api/payment/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-korapay-signature'] || '';
    const rawBody   = req.body.toString();

    let event;
    try { event = JSON.parse(rawBody); }
    catch (_) { return res.sendStatus(200); }

    // Korapay signs only the `data` object, not the full payload — see
    // https://developers.korapay.com/docs/webhooks. Hashing the raw body
    // (as before) never matches Korapay's signature, so this must be
    // computed over JSON.stringify(event.data) specifically.
    const dataString = JSON.stringify(event.data || {});
    if (!verifyKorapaySignature(dataString, signature)) {
      console.warn('Webhook: invalid or missing Korapay signature — ignoring');
      return res.sendStatus(200); // Always 200 to prevent retry storms
    }

    if (event.event !== 'charge.success') return res.sendStatus(200);

    const ref     = (event.data && event.data.reference) ? String(event.data.reference) : null;
    if (!ref) return res.sendStatus(200);

    const claimed = await claimOrder(ref);
    if (!claimed) return res.sendStatus(200);

    const amountCheck = checkPaidAmount(event.data.amount, event.data.currency, claimed);
    if (!amountCheck.ok) {
      console.error(`[payment] webhook amount check failed for ${ref}: ${amountCheck.reason}`);
      await Q.updateOrderStatus(ref, 'fulfillment_failed', { exoError: `Payment amount check failed (${amountCheck.reason}) — held for manual review` });
      return res.sendStatus(200);
    }

    try {
      const exoOrderId = await fulfillOrder(claimed);
      await Q.updateOrderStatus(ref, 'fulfilled', { exoOrderId });
      sendConfirmationEmail(claimed.internal_id);
    } catch (fulfillErr) {
      console.error('Fulfillment failed (webhook):', fulfillErr.message);
      await Q.updateOrderStatus(ref, 'fulfillment_failed', { exoError: fulfillErr.message });
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
  res.sendStatus(200);
});

// ─── ADMIN AUTH ───────────────────────────────────────────────────────────────
app.post('/admin/login', adminLoginLimiter, async (req, res) => {
  const username = (req.body.username || '').trim().slice(0, LIMITS.username);
  const password = (req.body.password || '').slice(0, LIMITS.password);

  if (!username || !password)
    return sendError(res, 400, 'Username and password required');

  try {
    const result = await pool.query('SELECT * FROM admin_users WHERE username = $1', [username]);
    const admin  = result.rows[0];

    // Always run bcrypt.compare even if user not found to prevent timing attacks
    const dummyHash = '$2a$12$dummy.hash.to.prevent.timing.attack.on.user.lookup.fake';
    const match = admin
      ? await bcrypt.compare(password, admin.password_hash)
      : await bcrypt.compare(password, dummyHash).then(() => false);

    if (!admin || !match)
      return sendError(res, 401, 'Invalid username or password');

    const sessionId = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO admin_sessions (id, admin_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '8 hours')`,
      [sessionId, admin.id]
    );
    res.cookie('admin_session', sessionId, {
      httpOnly: true, secure: IS_PROD, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000,
    });
    // CSRF double-submit token. Deliberately NOT httpOnly — the frontend must
    // be able to read it and echo it back in a header on every mutating
    // request. SameSite=Strict already stops it being read cross-site.
    const csrfToken = crypto.randomBytes(24).toString('hex');
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false, secure: IS_PROD, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Admin login error:', err.message);
    sendError(res, 500, 'Login failed. Please try again.');
  }
});

app.post('/admin/logout', async (req, res) => {
  const sessionId = req.cookies && req.cookies.admin_session;
  if (sessionId) await pool.query('DELETE FROM admin_sessions WHERE id = $1', [sessionId]).catch(() => {});
  res.clearCookie('admin_session');
  res.json({ success: true });
});

// ─── ADMIN API ────────────────────────────────────────────────────────────────
app.get('/admin/api/me', requireAdminAPI, (req, res) => {
  // Reissue the CSRF cookie here too, not just at login. This covers admins
  // who were already logged in before CSRF protection was added, without
  // forcing everyone to log out — the dashboard calls this on every load.
  if (!req.cookies || !req.cookies.csrf_token) {
    const csrfToken = crypto.randomBytes(24).toString('hex');
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false, secure: IS_PROD, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000,
    });
  }
  res.json({ success: true, username: req.admin.username });
});

app.get('/admin/api/stats', requireAdminAPI, async (req, res) => {
  try { res.json({ success: true, stats: await Q.getDashboardStats() }); }
  catch (err) { console.error('stats:', err.message); sendError(res, 500, 'Failed to load stats'); }
});

app.get('/admin/api/orders', requireAdminAPI, async (req, res) => {
  try {
    const limit  = Math.min(Math.max(parseInt(req.query.limit  || '25', 10), 1), 100);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    // Whitelist status values
    const validStatuses = ['pending','fulfilling','fulfilled','fulfillment_failed',''];
    const status = validStatuses.includes(req.query.status) ? req.query.status : '';
    const search = (req.query.search || '').trim().slice(0, 100);
    const { orders, total } = await Q.getAllOrders({ limit, offset, status, search });
    res.json({ success: true, orders, total });
  } catch (err) { console.error('orders:', err.message); sendError(res, 500, 'Failed to load orders'); }
});

app.get('/admin/api/revenue-chart', requireAdminAPI, async (req, res) => {
  try { res.json({ success: true, data: await Q.getDailyRevenue(30) }); }
  catch (err) { sendError(res, 500, 'Failed to load revenue data'); }
});

app.get('/admin/api/balance', requireAdminAPI, async (req, res) => {
  try {
    const data = await withRetry(() => smmwizRequest({ action: 'balance' }), 3, 'balance');
    res.json({ success: true, balance: data.balance });
  } catch (err) { sendError(res, 500, 'Failed to fetch balance'); }
});

app.post('/admin/api/retry/:internalId', requireAdminAPI, async (req, res) => {
  const id = (req.params.internalId || '').trim();
  if (!id || !/^BOG-[A-F0-9]{10}$/.test(id)) return sendError(res, 400, 'Invalid order ID');
  try {
    const order = await Q.getOrderById(id);
    if (!order) return sendError(res, 404, 'Order not found');
    if (order.status !== 'fulfillment_failed')
      return sendError(res, 400, 'Order is not in a failed state');
    await pool.query(`UPDATE orders SET status='fulfilling', updated_at=NOW() WHERE internal_id=$1`, [id]);
    try {
      const exoOrderId = await fulfillOrder(order);
      await Q.updateOrderStatus(order.paystack_ref, 'fulfilled', { exoOrderId });
      res.json({ success: true, message: 'Order fulfilled successfully', exoOrderId });
    } catch (fe) {
      await Q.updateOrderStatus(order.paystack_ref, 'fulfillment_failed', { exoError: fe.message });
      sendError(res, 500, 'Fulfillment failed: ' + fe.message);
    }
  } catch (err) { sendError(res, 500, 'Failed to retry order'); }
});

app.post('/admin/api/refill/:internalId', requireAdminAPI, async (req, res) => {
  const id = (req.params.internalId || '').trim();
  if (!id || !/^BOG-[A-F0-9]{10}$/.test(id)) return sendError(res, 400, 'Invalid order ID');
  try {
    const order = await Q.getOrderById(id);
    if (!order) return sendError(res, 404, 'Order not found');
    if (!order.smmwiz_order_id) return sendError(res, 400, 'No SMMWiz order ID on this order');
    const data = await withRetry(() => smmwizRequest({ action:'refill', order:order.smmwiz_order_id }), 3, 'refill');
    res.json({ success: true, data });
  } catch (err) { sendError(res, 500, 'Failed to request refill'); }
});

app.post('/admin/api/services/sync', requireAdminAPI, async (req, res) => {
  try { res.json({ success: true, services: await getSmmwizServices(true) }); }
  catch (err) { sendError(res, 500, 'Failed to sync services from SMMWiz'); }
});

app.get('/api/services/refresh', requireAdminAPI, async (req, res) => {
  try { res.json({ success: true, count: (await getSmmwizServices(true)).length }); }
  catch (err) { sendError(res, 500, 'Failed to refresh service cache'); }
});

// Force immediate price sync from admin dashboard
app.post('/admin/api/prices/sync', requireAdminAPI, async (req, res) => {
  try {
    await syncSmmwizPrices();
    const lastSync = await Q.getSetting('last_price_sync');
    const alerts   = await Q.getSetting('price_sync_alerts');
    res.json({ success: true, lastSync, alerts: alerts || '' });
  } catch (err) {
    sendError(res, 500, 'Price sync failed: ' + err.message);
  }
});

app.get('/admin/api/services', requireAdminAPI, async (req, res) => {
  try {
    const services = await Q.getAllServices(false);
    const rate     = await getLiveRate();
    res.json({
      success: true,
      services: services.map(s => ({
        ...s,
        ghs_price_per_1000: parseFloat((parseFloat(s.smmwiz_price_per_1000) * parseFloat(s.markup_multiplier) * rate).toFixed(2)),
      })),
    });
  } catch (err) { sendError(res, 500, 'Failed to load services'); }
});

app.post('/admin/api/services/import', requireAdminAPI, async (req, res) => {
  try {
    const { services } = req.body;
    if (!Array.isArray(services) || !services.length)
      return sendError(res, 400, 'services array required');
    if (services.length > 200)
      return sendError(res, 400, 'Maximum 200 services per import');
    const results = [];
    const skipped = [];
    for (const s of services) {
      // Validate each service entry
      const smmwizId = parseInt(s.smmwizId, 10);
      const minQty   = parseInt(s.minQty, 10);
      const maxQty   = parseInt(s.maxQty, 10);
      const price    = parseFloat(s.price);
      const markup   = parseFloat(s.markup) || MARKUP[s.category] || 1.40;
      if (isNaN(smmwizId) || isNaN(minQty) || isNaN(maxQty) || isNaN(price)) {
        skipped.push({ name: s.name || '(unnamed)', reason: 'invalid smmwizId/minQty/maxQty/price' });
        continue;
      }
      const validPlatforms = ['tiktok','instagram','youtube','facebook','telegram','snapchat','twitter','spotify','other'];
      const platform = validPlatforms.includes(s.platform) ? s.platform : 'other';
      try {
        results.push(await Q.upsertService({
          internalKey: `${platform}-${smmwizId}`,
          smmwizId, name: String(s.name || '').slice(0, 150),
          platform, category: s.category || 'other',
          minQuantity: minQty, maxQuantity: maxQty,
          smmwizPricePer1000: price, markupMultiplier: markup, displayOrder: 0,
        }));
      } catch (rowErr) {
        // Most commonly a UNIQUE violation on smmwiz_id — surface it instead
        // of silently dropping the row, so a seed/import mistake is visible.
        skipped.push({ name: s.name || '(unnamed)', smmwizId, reason: rowErr.message });
      }
    }
    res.json({ success: true, imported: results.length, skipped: skipped.length, skippedDetails: skipped });
  } catch (err) { sendError(res, 500, 'Import failed'); }
});

app.post('/admin/api/services/:id/toggle', requireAdminAPI, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return sendError(res, 400, 'Invalid service ID');
    const row = await Q.toggleService(id, !!req.body.isActive);
    if (!row) return sendError(res, 404, 'Service not found');
    res.json({ success: true, service: row });
  } catch (err) { sendError(res, 500, 'Failed to toggle service'); }
});

app.put('/admin/api/services/:id/markup', requireAdminAPI, async (req, res) => {
  try {
    const id     = parseInt(req.params.id, 10);
    const markup = parseFloat(req.body.markup);
    if (isNaN(id)) return sendError(res, 400, 'Invalid service ID');
    if (isNaN(markup) || markup < 1.0 || markup > 10.0)
      return sendError(res, 400, 'Markup must be between 1.0 and 10.0');
    const row = await Q.updateServiceMarkup(id, markup);
    if (!row) return sendError(res, 404, 'Service not found');
    res.json({ success: true, service: row });
  } catch (err) { sendError(res, 500, 'Failed to update markup'); }
});

// Update a service's SMMWiz ID and optionally its name/price
app.put('/admin/api/services/:id/smmwiz', requireAdminAPI, async (req, res) => {
  try {
    const id        = parseInt(req.params.id, 10);
    const smmwizId  = parseInt(req.body.smmwizId, 10);
    const name      = (req.body.name || '').trim().slice(0, 150);
    const price     = parseFloat(req.body.price);

    if (isNaN(id))       return sendError(res, 400, 'Invalid service ID');
    if (isNaN(smmwizId)) return sendError(res, 400, 'Invalid SMMWiz ID — must be a number');

    // Check the new SMMWiz ID is not already used by another service
    const conflict = await pool.query(
      'SELECT id, name FROM service_map WHERE smmwiz_id = $1 AND id != $2',
      [smmwizId, id]
    );
    if (conflict.rows.length > 0) {
      return sendError(res, 409,
        `SMMWiz ID ${smmwizId} is already used by service "${conflict.rows[0].name}". Each service must have a unique SMMWiz ID.`
      );
    }

    const sets  = ['smmwiz_id = $2', 'updated_at = NOW()'];
    const vals  = [id, smmwizId];
    let   idx   = 3;

    if (name)         { sets.push(`name = $${idx++}`);                    vals.push(name); }
    if (!isNaN(price)){ sets.push(`smmwiz_price_per_1000 = $${idx++}`);   vals.push(price); }

    const result = await pool.query(
      `UPDATE service_map SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      vals
    );
    if (!result.rows.length) return sendError(res, 404, 'Service not found');
    res.json({ success: true, service: result.rows[0] });
  } catch (err) {
    console.error('update smmwiz id:', err.message);
    sendError(res, 500, 'Failed to update SMMWiz ID');
  }
});

app.get('/admin/api/settings', requireAdminAPI, async (req, res) => {
  try {
    const keys = [
      'usd_to_ghs_rate','site_name','whatsapp_number',
      'low_balance_threshold','last_price_sync','price_sync_alerts'
    ];
    const settings = {};
    for (const key of keys) settings[key] = await Q.getSetting(key);
    res.json({ success: true, settings });
  } catch (err) { sendError(res, 500, 'Failed to load settings'); }
});

app.put('/admin/api/settings', requireAdminAPI, async (req, res) => {
  try {
    const allowed = ['usd_to_ghs_rate','site_name','whatsapp_number','low_balance_threshold'];
    for (const key of allowed) {
      if (req.body[key] === undefined) continue;
      const val = String(req.body[key]).slice(0, 200);
      // Extra validation for numeric fields
      if (key === 'usd_to_ghs_rate') {
        const rate = parseFloat(val);
        if (isNaN(rate) || rate < 1 || rate > 1000)
          return sendError(res, 400, 'USD to GHS rate must be a number between 1 and 1000');
        await Q.updateSetting(key, String(rate));
      } else if (key === 'low_balance_threshold') {
        const thresh = parseFloat(val);
        if (isNaN(thresh) || thresh < 0)
          return sendError(res, 400, 'Low balance threshold must be a positive number');
        await Q.updateSetting(key, String(thresh));
      } else {
        await Q.updateSetting(key, val);
      }
    }
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (err) { sendError(res, 500, 'Failed to update settings'); }
});

app.post('/admin/change-credentials', requireAdminAPI, async (req, res) => {
  const currentPassword = (req.body.currentPassword || '').slice(0, LIMITS.password);
  const newUsername     = (req.body.newUsername     || '').trim().slice(0, LIMITS.username);
  const newPassword     = (req.body.newPassword     || '').slice(0, LIMITS.password);

  if (!currentPassword) return sendError(res, 400, 'Current password is required');
  try {
    const admin = await Q.getAdminById(req.admin.admin_id);
    if (!admin) return sendError(res, 404, 'Admin not found');

    const match = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!match) return sendError(res, 401, 'Current password is incorrect');

    if (newUsername) {
      if (newUsername.length < 3) return sendError(res, 400, 'Username must be at least 3 characters');
      if (await Q.isUsernameTaken(newUsername, admin.id))
        return sendError(res, 400, 'Username is already taken');
    }

    const updates = {};
    if (newUsername) updates.newUsername = newUsername;
    if (newPassword) {
      if (newPassword.length < 8) return sendError(res, 400, 'Password must be at least 8 characters');
      updates.newPasswordHash = await bcrypt.hash(newPassword, 12);
    }
    if (!Object.keys(updates).length) return sendError(res, 400, 'No changes provided');

    await Q.updateAdminCredentials(admin.id, updates);
    await Q.invalidateAdminSessions(admin.id);
    Q.logAdminAction(admin.id, 'change_credentials',
      `username_changed=${!!newUsername}, password_changed=${!!newPassword}`, req.ip)
      .catch(err => console.error('audit log failed:', err.message));
    res.clearCookie('admin_session');
    res.json({ success: true, message: 'Credentials updated. Please log in again.' });
  } catch (err) {
    console.error('change-credentials:', err.message);
    sendError(res, 500, 'Failed to update credentials');
  }
});

app.delete('/admin/delete-order/:id', requireAdminAPI, destructiveActionLimiter, requireStepUpPassword, async (req, res) => {
  const id = (req.params.id || '').trim();
  if (!id || !/^BOG-[A-F0-9]{10}$/.test(id)) return sendError(res, 400, 'Invalid order ID');
  try {
    const result = await pool.query('DELETE FROM orders WHERE internal_id=$1 RETURNING id', [id]);
    if (!result.rowCount) return sendError(res, 404, 'Order not found');
    Q.logAdminAction(req.admin.admin_id, 'delete_order', id, req.ip)
      .catch(err => console.error('audit log failed:', err.message));
    res.json({ success: true });
  } catch (err) { sendError(res, 500, 'Failed to delete order'); }
});

app.post('/admin/clear-all-orders', requireAdminAPI, destructiveActionLimiter, requireStepUpPassword, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM orders RETURNING id');
    Q.logAdminAction(req.admin.admin_id, 'clear_all_orders', `deleted=${result.rowCount}`, req.ip)
      .catch(err => console.error('audit log failed:', err.message));
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) { sendError(res, 500, 'Failed to clear orders'); }
});

app.get('/admin/api/export/csv', requireAdminAPI, async (req, res) => {
  try {
    const orders  = await Q.exportAllOrders();
    const headers = [
      'internal_id','paystack_ref','service_name','platform','email',
      'quantity','amount_ghs','currency','status','smmwiz_order_id',
      'link','created_at','fulfilled_at'
    ];
    const escape = v => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? `"${s}"` : s;
    };
    const rows = [
      headers.join(','),
      ...orders.map(o => headers.map(h =>
        h === 'amount_ghs' ? escape((o.amount / 100).toFixed(2)) : escape(o[h])
      ).join(',')),
    ];
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bigone-orders-${date}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(rows.join('\n'));
  } catch (err) { sendError(res, 500, 'Failed to export orders'); }
});

// ─── 404 & ERROR HANDLERS ─────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/admin/api/'))
    return sendError(res, 404, 'Not found');
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler — never leak stack traces to client
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (res.headersSent) return next(err);
  sendError(res, 500, 'An unexpected error occurred. Please try again.');
});

// ─── PERIODIC JOBS ────────────────────────────────────────────────────────────

// 1. Clean expired admin sessions every hour
setInterval(async () => {
  try {
    const count = await Q.cleanExpiredSessions();
    if (count > 0) console.log(`[cleanup] Removed ${count} expired admin sessions`);
  } catch (err) {
    console.error('[cleanup] Session cleanup error:', err.message);
  }
}, 60 * 60 * 1000);

// 2. Auto-sync SMMWiz prices every 6 hours
// Fetches live USD prices for all mapped services and updates the database.
// Your GHS prices update automatically — no manual work needed.
async function syncSmmwizPrices() {
  try {
    console.log('[price-sync] Fetching live SMMWiz prices...');
    const liveServices = await getSmmwizServices(true); // force fresh fetch
    if (!liveServices.length) {
      console.warn('[price-sync] No services returned from SMMWiz — skipping update');
      return;
    }

    // Build a lookup map: smmwiz_id -> rate
    const priceMap = new Map();
    for (const svc of liveServices) {
      priceMap.set(parseInt(svc.service, 10), parseFloat(svc.rate));
    }

    // Fetch all our mapped services
    const mapped = await Q.getAllServices(false);
    let updated = 0;
    let increased = 0;
    let decreased = 0;
    const alerts = [];

    for (const svc of mapped) {
      const newPrice = priceMap.get(svc.smmwiz_id);
      if (newPrice === undefined) continue; // service removed from SMMWiz

      const oldPrice = parseFloat(svc.smmwiz_price_per_1000);
      if (Math.abs(newPrice - oldPrice) < 0.000001) continue; // no change

      const changePct = ((newPrice - oldPrice) / oldPrice) * 100;

      // Update the price in database
      await pool.query(
        `UPDATE service_map
         SET smmwiz_price_per_1000 = $1, updated_at = NOW()
         WHERE id = $2`,
        [newPrice, svc.id]
      );

      updated++;
      if (newPrice > oldPrice) {
        increased++;
        // Alert if price rose more than 20% — could impact your margins
        if (changePct > 20) {
          alerts.push(
            `⚠️  ${svc.name}: $${oldPrice.toFixed(4)} → $${newPrice.toFixed(4)} (+${changePct.toFixed(1)}%)`
          );
        }
      } else {
        decreased++;
      }

      console.log(
        `[price-sync] ${svc.name}: $${oldPrice.toFixed(4)} → $${newPrice.toFixed(4)} (${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%)`
      );
    }

    if (updated === 0) {
      console.log('[price-sync] All prices unchanged');
    } else {
      console.log(`[price-sync] Updated ${updated} service prices (↑${increased} up, ↓${decreased} down)`);
    }

    // Save last sync time and any alerts to settings table
    await Q.updateSetting('last_price_sync', new Date().toISOString());
    if (alerts.length > 0) {
      await Q.updateSetting('price_sync_alerts', alerts.join('\n'));
      console.warn('[price-sync] PRICE ALERTS:\n' + alerts.join('\n'));
    } else {
      await Q.updateSetting('price_sync_alerts', '');
    }
  } catch (err) {
    console.error('[price-sync] Auto price sync failed:', err.message);
  }
}

// Run immediately on startup, then every 6 hours
syncSmmwizPrices();
setInterval(syncSmmwizPrices, 6 * 60 * 60 * 1000);

// 3. Reconcile stuck 'pending' orders every 10 minutes.
// Safety net for payments that neither the redirect callback nor the webhook
// fulfilled (customer closed the tab AND the webhook was missed / its signature
// mismatched). Re-verifies each stale order against Korapay and fulfills the
// ones that actually paid. claimOrder makes this idempotent with the other two
// paths — only one of them can ever transition a given order out of 'pending'.
async function reconcilePendingOrders() {
  try {
    const stale = await Q.getStalePendingOrders(15, 24);
    if (!stale.length) return;
    console.log(`[reconcile] Checking ${stale.length} stale pending order(s)...`);
    for (const order of stale) {
      const ref = order.paystack_ref;
      try {
        const verify = await korapayVerify(ref);
        if (!verify.status || !verify.data || verify.data.status !== 'success') continue; // not paid — leave pending

        const claimed = await claimOrder(ref);
        if (!claimed) continue; // another path already claimed it

        const amountCheck = checkPaidAmount(verify.data.amount, verify.data.currency, claimed);
        if (!amountCheck.ok) {
          console.error(`[reconcile] amount check failed for ${ref}: ${amountCheck.reason}`);
          await Q.updateOrderStatus(ref, 'fulfillment_failed', { exoError: `Payment amount check failed (${amountCheck.reason}) — held for manual review` });
          continue;
        }

        try {
          const exoOrderId = await fulfillOrder(claimed);
          await Q.updateOrderStatus(ref, 'fulfilled', { exoOrderId });
          sendConfirmationEmail(claimed.internal_id);
          console.log(`[reconcile] Recovered and fulfilled ${claimed.internal_id}`);
        } catch (fulfillErr) {
          console.error(`[reconcile] Fulfillment failed for ${ref}:`, fulfillErr.message);
          await Q.updateOrderStatus(ref, 'fulfillment_failed', { exoError: fulfillErr.message });
        }
      } catch (err) {
        console.error(`[reconcile] Error checking ${ref}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[reconcile] Sweep failed:', err.message);
  }
}
setInterval(reconcilePendingOrders, 10 * 60 * 1000);

// ─── START ────────────────────────────────────────────────────────────────────
const server = app.listen(CONFIG.PORT, () => {
  console.log('\n🚀 BigOne Growth Lab');
  console.log(`   URL:  http://localhost:${CONFIG.PORT}`);
  console.log(`   Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Base: ${CONFIG.BASE_URL}`);
  console.log(`   Pay:  Korapay GHS (mobile_money · card · bank_transfer)\n`);
});

// Graceful shutdown — hosts (Render, etc.) send SIGTERM on every redeploy.
// Stop accepting new connections, then drain the DB pool so in-flight requests
// finish and no connections leak. Force-exit if draining takes too long.
function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully...`);
  server.close(() => {
    pool.end()
      .then(() => { console.log('DB pool closed. Bye.'); process.exit(0); })
      .catch(() => process.exit(0));
  });
  setTimeout(() => { console.error('Forced shutdown after timeout.'); process.exit(1); }, 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
