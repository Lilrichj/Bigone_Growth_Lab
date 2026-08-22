'use strict';

const PLATFORMS = {
  tiktok: { label:'TikTok', svg:`<svg viewBox="0 0 24 24" fill="#010101"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.78a4.85 4.85 0 0 1-1.01-.09z"/></svg>` },
  instagram: { label:'Instagram', svg:`<svg viewBox="0 0 24 24"><path fill="#E1306C" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>` },
  youtube: { label:'YouTube', svg:`<svg viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>` },
  facebook: { label:'Facebook', svg:`<svg viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>` },
  telegram: { label:'Telegram', svg:`<svg viewBox="0 0 24 24" fill="#2AABEE"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>` },
  snapchat: { label:'Snapchat', svg:`<svg viewBox="0 0 24 24"><path fill="#FFFC00" d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z"/></svg>` },
  twitter: { label:'Twitter/X', svg:`<svg viewBox="0 0 24 24" fill="#000000"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>` },
  spotify: { label:'Spotify', svg:`<svg viewBox="0 0 24 24" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>` },
};

const STATUS_LABELS = { pending:'Pending', fulfilling:'Processing', fulfilled:'Fulfilled', fulfillment_failed:'Failed' };
const STATUS_BADGE_CLASS = { pending:'badge-pending', fulfilling:'badge-fulfilling', fulfilled:'badge-fulfilled', fulfillment_failed:'badge-fulfillment_failed' };

function escHtml(s) {
  if (s == null) return '—';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

function showError(msg) {
  const el = document.getElementById('errorCard');
  el.textContent = '⚠️ ' + msg;
  el.classList.add('visible');
  document.getElementById('resultCard').classList.remove('visible');
  document.getElementById('loadingCard').classList.remove('visible');
}
function showLoading(v) {
  document.getElementById('loadingCard').classList.toggle('visible', v);
  if (v) {
    document.getElementById('errorCard').classList.remove('visible');
    document.getElementById('resultCard').classList.remove('visible');
  }
}

async function trackOrder() {
  const rawId = document.getElementById('orderIdInput').value.trim().toUpperCase();
  if (!rawId) return showError('Please enter your Order ID.');
  if (!rawId.startsWith('BOG-')) return showError('Order IDs start with BOG- (e.g. BOG-XXXXXXXXXX).');

  showLoading(true);
  document.getElementById('trackBtn').disabled = true;

  try {
    const res  = await fetch(`/api/order/status?order=${encodeURIComponent(rawId)}`);
    const data = await res.json();

    if (!data.success) {
      showError(data.error || 'Order not found. Please check your Order ID.');
      return;
    }

    showLoading(false);
    renderResult(data);
  } catch (err) {
    showError('Network error. Please check your connection and try again.');
  } finally {
    document.getElementById('trackBtn').disabled = false;
  }
}

function renderResult(o) {
  const pInfo = PLATFORMS[o.platform] || { label: o.platform || '—', svg: '' };
  document.getElementById('rPlatformIcon').innerHTML = pInfo.svg;
  document.getElementById('rId').textContent = o.id;
  document.getElementById('rService').textContent = o.service_name || '—';
  document.getElementById('rBadge').innerHTML =
    `<span class="badge ${STATUS_BADGE_CLASS[o.status] || 'badge-pending'}">${STATUS_LABELS[o.status] || escHtml(o.status)}</span>`;

  const amountGhs = o.amount ? (o.amount / 100).toFixed(2) : '—';
  const createdAt = o.created_at ? new Date(o.created_at).toLocaleString('en-GH', {
    timeZone:'Africa/Accra', dateStyle:'medium', timeStyle:'short'
  }) : '—';

  const rows = [
    ['Platform',           escHtml(pInfo.label)],
    ['Quantity',           o.quantity ? Number(o.quantity).toLocaleString() : '—'],
    ['Link',               escHtml(o.link)],
    ['Amount Paid',        `GHS ${escHtml(amountGhs)}`],
    ['Order Date',         escHtml(createdAt)],
    ['Estimated Delivery', escHtml(o.estimated_delivery || '1-8 hours')],
  ];

  // Show generic message for failures — never expose internal supplier IDs or error details
  if (o.status === 'fulfillment_failed') {
    rows.push(['Note', 'There was an issue processing your order. Please contact support with your Order ID.']);
  }

  // Email reminder row when fulfilled
  if (o.status === 'fulfilled') {
    rows.push(['Confirmation Email', 'Sent to your email address. Check Spam/Junk if not in inbox.']);
  }

  document.getElementById('rDetails').innerHTML = rows.map(([label, val]) => `
    <div class="detail-row">
      <span class="detail-label">${label}</span>
      <span class="detail-value" style="word-break:break-all">${val}</span>
    </div>`).join('');

  document.getElementById('resultCard').classList.add('visible');
}

// ─── WIRE EVERYTHING — no inline handlers, so this works under a strict CSP ──
document.addEventListener('DOMContentLoaded', () => {
  const input   = document.getElementById('orderIdInput');
  const trackBtn = document.getElementById('trackBtn');

  trackBtn.addEventListener('click', trackOrder);
  input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') trackOrder(); });

  // Auto-track if orderId is present in the URL
  const params = new URLSearchParams(window.location.search);
  const id = params.get('orderId') || params.get('order');
  if (id) {
    input.value = id.toUpperCase();
    trackOrder();
  }
});
