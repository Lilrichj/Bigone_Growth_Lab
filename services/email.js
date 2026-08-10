'use strict';
require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  // Force IPv4. Render's containers (and many cloud/container platforms)
  // can't route outbound IPv6 traffic, but Gmail's SMTP hostname resolves to
  // both an IPv4 and IPv6 address — without this, Node can pick the IPv6
  // one and every send fails with ENETUNREACH before it ever reaches Google.
  family: 4,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify()
  .then(() => console.log('✅ Email transporter ready'))
  .catch(err => console.error('❌ Email transporter error:', err.message));

// Escape HTML to prevent injection in email templates
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

async function sendOrderConfirmation(order) {
  try {
    const { getSetting } = require('../db/queries');
    const whatsappNumber = await getSetting('whatsapp_number').catch(() => '');
    const baseUrl = (process.env.BASE_URL || 'https://bigonegrowthlab.store').replace(/\/$/, '');

    const amountGhs = (order.amount / 100).toFixed(2);
    const orderDate = new Date(order.created_at).toLocaleString('en-GH', {
      timeZone: 'Africa/Accra', dateStyle: 'medium', timeStyle: 'short',
    });

    const cleanPhone = whatsappNumber ? whatsappNumber.replace(/\D/g, '') : '';
    const whatsappBtn = cleanPhone
      ? `<a href="https://wa.me/${cleanPhone}"
            style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;
                   padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;margin:8px 6px;">
           💬 Chat with Support on WhatsApp
         </a>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Order Confirmed — BigOne Growth Lab</title></head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f1e;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#00e5ff,#7c3aff);border-radius:16px 16px 0 0;padding:36px 40px;text-align:center;">
          <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.8);letter-spacing:2px;text-transform:uppercase;">BigOne Growth Lab</p>
          <h1 style="margin:0;font-size:28px;color:#fff;font-weight:800;">&#x1F389; Order Confirmed!</h1>
          <p style="margin:10px 0 0;color:rgba(255,255,255,0.9);font-size:15px;">Your order has been received and is being processed.</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#111827;padding:36px 40px;">

          <!-- Order ID Box -->
          <div style="background:linear-gradient(135deg,rgba(0,229,255,0.1),rgba(124,58,255,0.1));
                      border:2px solid rgba(0,229,255,0.3);border-radius:12px;
                      padding:24px;text-align:center;margin-bottom:28px;">
            <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;letter-spacing:1.5px;text-transform:uppercase;">Your Order ID</p>
            <p style="margin:0 0 8px;font-size:30px;font-weight:800;color:#00e5ff;
                      font-family:'Courier New',monospace;letter-spacing:2px;">${esc(order.internal_id)}</p>
            <p style="margin:0;font-size:12px;color:#94a3b8;">Save this — you will need it to track your order</p>
          </div>

          <!-- Email not received note -->
          <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);
                      border-radius:10px;padding:14px 20px;margin-bottom:24px;font-size:13px;color:#f59e0b;">
            &#x26A0;&#xFE0F; <strong>Didn't receive this email?</strong>
            Check your <strong>Spam / Junk</strong> or <strong>Promotions</strong> folder.
            If it is not there, you can still track your order at any time using your Order ID above.
          </div>

          <!-- Order Details Table -->
          <h2 style="margin:0 0 16px;font-size:16px;color:#f1f5f9;font-weight:700;">Order Details</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:28px;">
            ${[
              ['Service',            esc(order.service_name)],
              ['Platform',           esc(order.platform ? order.platform.charAt(0).toUpperCase() + order.platform.slice(1) : '—')],
              ['Quantity',           Number(order.quantity).toLocaleString()],
              ['Profile / Post Link', esc(order.link)],
              ['Amount Paid',        `GHS ${esc(amountGhs)}`],
              ['Estimated Delivery', esc(order.estimated_delivery || '1–5 minutes')],
              ['Order Date',         esc(orderDate)],
            ].map(([label, val], i) => `
            <tr style="background:${i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent'}">
              <td style="padding:10px 14px;font-size:13px;color:#94a3b8;border-bottom:1px solid rgba(255,255,255,0.06);width:38%;">${label}</td>
              <td style="padding:10px 14px;font-size:13px;color:#f1f5f9;border-bottom:1px solid rgba(255,255,255,0.06);word-break:break-all;">${val}</td>
            </tr>`).join('')}
          </table>

          <!-- What happens next -->
          <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);
                      border-radius:10px;padding:20px 24px;margin-bottom:28px;">
            <h3 style="margin:0 0 12px;font-size:14px;color:#22c55e;font-weight:700;">&#x2705; What happens next?</h3>
            <ul style="margin:0;padding-left:18px;color:#94a3b8;font-size:13px;line-height:1.8;">
              <li>Delivery starts within the estimated time shown above</li>
              <li>Your account stays safe — we never ask for your password</li>
              <li>Track your order anytime using the button below or your Order ID</li>
              <li>Reply to this email or use WhatsApp below for support</li>
            </ul>
          </div>

          <!-- Buttons -->
          <div style="text-align:center;margin-bottom:8px;">
            <a href="${baseUrl}/track?orderId=${esc(order.internal_id)}"
               style="display:inline-block;background:linear-gradient(135deg,#00e5ff,#7c3aff);
                      color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;
                      font-weight:700;font-size:15px;margin:8px 6px;">
              &#x1F4E6; Track My Order
            </a>
            ${whatsappBtn}
          </div>

        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#0d1326;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
          <p style="margin:0 0 6px;font-size:12px;color:#475569;">
            Didn't get your order? Contact us with your Order ID: <strong style="color:#f1f5f9;">${esc(order.internal_id)}</strong>
          </p>
          <p style="margin:0;font-size:12px;color:#475569;">
            &#169; 2025 BigOne Growth Lab &nbsp;&middot;&nbsp;
            <a href="mailto:bigonegrowthlab@gmail.com" style="color:#00e5ff;text-decoration:none;">bigonegrowthlab@gmail.com</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
      from:    process.env.EMAIL_FROM || '"BigOne Growth Lab" <bigonegrowthlab@gmail.com>',
      to:      order.email,
      subject: `Order Confirmed — ${order.internal_id} | BigOne Growth Lab`,
      html,
    });
    return true;
  } catch (err) {
    console.error('sendOrderConfirmation error:', err.message);
    return false;
  }
}

async function sendContactEmail({ name, email, message }) {
  const timestamp = new Date().toLocaleString('en-GH', {
    timeZone: 'Africa/Accra', dateStyle: 'full', timeStyle: 'short',
  });

  // All user input is HTML-escaped before insertion into the email template
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Contact Form</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="max-width:560px;width:100%;background:#fff;border-radius:12px;
                    overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#0a0f1e,#1e1b4b);padding:28px 36px;">
          <h1 style="margin:0;font-size:20px;color:#00e5ff;font-weight:700;">&#x1F4EC; New Contact Form Submission</h1>
          <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">BigOne Growth Lab</p>
        </td></tr>
        <tr><td style="padding:30px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#64748b;width:30%;">From</td>
              <td style="padding:8px 0;font-size:14px;color:#1e293b;font-weight:600;">${esc(name)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#64748b;">Reply-to</td>
              <td style="padding:8px 0;font-size:14px;">
                <a href="mailto:${esc(email)}" style="color:#7c3aff;">${esc(email)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#64748b;">Received</td>
              <td style="padding:8px 0;font-size:13px;color:#475569;">${esc(timestamp)}</td>
            </tr>
          </table>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
          <h3 style="margin:0 0 12px;font-size:14px;color:#374151;">Message</h3>
          <div style="background:#f8fafc;border-left:4px solid #7c3aff;padding:16px 20px;
                      border-radius:0 8px 8px 0;font-size:14px;color:#374151;
                      line-height:1.7;white-space:pre-wrap;">${esc(message)}</div>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 36px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">BigOne Growth Lab &middot; bigonegrowthlab@gmail.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || '"BigOne Growth Lab" <bigonegrowthlab@gmail.com>',
    to:      process.env.EMAIL_USER,
    replyTo: email,
    subject: `Contact Form: ${name} — BigOne Growth Lab`,
    html,
  });
}

module.exports = { sendOrderConfirmation, sendContactEmail };
