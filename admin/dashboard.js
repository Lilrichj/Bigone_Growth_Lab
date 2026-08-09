'use strict';

// ─── CSRF ────────────────────────────────────────────────────────────────
// The server issues a csrf_token cookie (readable, not httpOnly) and expects
// it echoed back as X-CSRF-Token on every mutating /admin request. Rather
// than editing every fetch() call in this file individually, wrap fetch
// once so every current and future POST/PUT/DELETE/PATCH to /admin gets it
// automatically.
function getCookieValue(name) {
  const match = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
  return match ? decodeURIComponent(match[1]) : '';
}
(function installCsrfFetchWrapper() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = function (url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const isAdminMutation = typeof url === 'string' && url.startsWith('/admin/')
      && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && url !== '/admin/login';
    if (isAdminMutation) {
      options = { ...options, headers: { ...(options.headers || {}), 'X-CSRF-Token': getCookieValue('csrf_token') } };
    }
    return originalFetch(url, options);
  };
})();

// ─── ESCAPE HELPER ─────────────────────────────────────────────────────────
// Any value that originates from a customer (order email, link) or from a
// third party (SMMWiz service names) MUST go through this before being
// inserted via innerHTML. Never trust these fields just because validation
// exists elsewhere — validation can have gaps, escaping on output can't.
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Order status is a small fixed set of values the server itself assigns.
// Whitelisting before use as a CSS class name is cheap insurance against any
// future code path that lets an unexpected value reach here.
const VALID_ORDER_STATUSES = new Set(['pending', 'fulfilling', 'fulfilled', 'fulfillment_failed']);
function safeStatusClass(status) {
  return VALID_ORDER_STATUSES.has(status) ? status : 'pending';
}

// Auth guard: checked once, inside DOMContentLoaded near the bottom of this
// file (search "INIT"). A second copy used to run here at module load too —
// removed, since it just fired the identical request twice on every page load.

// ─── SIDEBAR ───────────────────────────────────────────────────────────────
function openSidebar()  { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebarOverlay').classList.add('open'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('open'); }

// ─── SECTION NAV ──────────────────────────────────────────────────────────
const SECTION_TITLES = { overview:'Overview', orders:'Orders', services:'Services', settings:'Settings', credentials:'Credentials' };
function showSection(name) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  document.querySelectorAll('.sidebar-link').forEach(l => { if (l.textContent.toLowerCase().includes(name)) l.classList.add('active'); });
  document.getElementById('topbarTitle').textContent = SECTION_TITLES[name] || name;
  closeSidebar();
  if (name === 'orders')   loadOrders();
  if (name === 'services') loadServices();
  if (name === 'settings') loadSettings();
}

// ─── TOAST ─────────────────────────────────────────────────────────────────
function toast(msg, type='info') {
  const c = document.createElement('div');
  c.style.cssText='position:fixed;top:20px;right:20px;z-index:9999';
  const t = document.createElement('div');
  t.className=`toast ${type}`;t.textContent=msg;
  document.body.appendChild(c);c.appendChild(t);
  setTimeout(()=>{ t.style.animation='toastOut .3s ease forwards';setTimeout(()=>c.remove(),300); },4000);
}

// ─── MODAL ─────────────────────────────────────────────────────────────────
function openModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

// Reusable password step-up prompt for irreversible actions. Returns the
// password string, or null if the admin cancels. Uses a masked input inside
// the existing modal rather than a plaintext browser prompt().
function confirmWithPassword(message) {
  return new Promise((resolve) => {
    openModal('Confirm — Password Required', `
      <p style="margin-bottom:16px;color:var(--text-secondary)">${message}</p>
      <input type="password" class="admin-input" id="stepUpPassword" placeholder="Current admin password" autocomplete="current-password">
      <div style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end">
        <button class="btn btn-outline btn-sm" id="stepUpCancel">Cancel</button>
        <button class="btn btn-danger btn-sm" id="stepUpConfirm">Confirm</button>
      </div>
    `);
    const input   = document.getElementById('stepUpPassword');
    const cleanup = (result) => { closeModal(); resolve(result); };
    document.getElementById('stepUpCancel').addEventListener('click', () => cleanup(null));
    document.getElementById('stepUpConfirm').addEventListener('click', () => cleanup(input.value || null));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') cleanup(input.value || null); });
    input.focus();
  });
}

// ─── LOGOUT ────────────────────────────────────────────────────────────────
async function doLogout() {
  await fetch('/admin/logout',{method:'POST',credentials:'include'});
  window.location.href='/admin/login';
}

// ─── LOAD OVERVIEW ─────────────────────────────────────────────────────────
async function loadOverview() {
  try {
    const [statsRes, chartRes, balRes, settingsRes] = await Promise.all([
      fetch('/admin/api/stats',        {credentials:'include'}),
      fetch('/admin/api/revenue-chart',{credentials:'include'}),
      fetch('/admin/api/balance',      {credentials:'include'}),
      fetch('/admin/api/settings',     {credentials:'include'}),
    ]);
    const stats   = await statsRes.json();
    const chart   = await chartRes.json();
    const bal     = await balRes.json();
    const settings= await settingsRes.json();

    if (stats.success) {
      const s = stats.stats;
      document.getElementById('sTotalOrders').textContent  = s.total.toLocaleString();
      document.getElementById('sFulfilled').textContent    = s.fulfilled.toLocaleString();
      document.getElementById('sPending').textContent      = s.pending.toLocaleString();
      document.getElementById('sFailed').textContent       = s.failed.toLocaleString();
      document.getElementById('sOrdersToday').textContent  = s.orders_today.toLocaleString();
      document.getElementById('sRevenueToday').textContent = 'GHS ' + s.revenue_today_ghs.toFixed(2);
      document.getElementById('sTotalRevenue').textContent = 'GHS ' + s.total_revenue_ghs.toFixed(2);
    }
    if (bal.success) {
      document.getElementById('sBalance').textContent = '$' + parseFloat(bal.balance).toFixed(2);
      const threshold = settings.success ? parseFloat(settings.settings.low_balance_threshold || '10') : 10;
      if (parseFloat(bal.balance) < threshold) {
        const banner = document.getElementById('balanceBanner');
        document.getElementById('balanceBannerText').textContent =
          `Low SMMWiz Balance: $${parseFloat(bal.balance).toFixed(2)} — Top up to avoid order failures`;
        banner.classList.add('visible');
      }
    }
    if (chart.success && chart.data.length) {
      renderRevenueChart(chart.data);
    }
  } catch(e) { console.error('loadOverview:', e); }
}

let revenueChartInstance = null;
function renderRevenueChart(data) {
  const ctx = document.getElementById('revenueChart').getContext('2d');
  if (revenueChartInstance) revenueChartInstance.destroy();
  revenueChartInstance = new Chart(ctx, {
    type:'bar',
    data:{
      labels: data.map(d => d.date.slice(5)),
      datasets:[{
        label:'Revenue (GHS)',
        data: data.map(d => d.revenue_ghs),
        backgroundColor:'rgba(0,229,255,0.25)',
        borderColor:'#00e5ff',
        borderWidth:2,
        borderRadius:4,
      }]
    },
    options:{
      responsive:true,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ color:'#94a3b8', font:{size:11} }, grid:{ color:'rgba(255,255,255,0.04)' } },
        y:{ ticks:{ color:'#94a3b8', font:{size:11} }, grid:{ color:'rgba(255,255,255,0.06)' } }
      }
    }
  });
}

// ─── ORDERS ────────────────────────────────────────────────────────────────
let ordersPage = 0;
const PAGE_SIZE = 25;
let searchTimer;
let currentOrders = []; // orders currently on screen, for safe lookup by id (avoids embedding JSON in HTML attributes)

function debounceLoad() { clearTimeout(searchTimer); searchTimer = setTimeout(loadOrders, 400); }

async function loadOrders() {
  const search = document.getElementById('searchInput').value.trim();
  const status = document.getElementById('statusFilter').value;
  const offset = ordersPage * PAGE_SIZE;

  const params = new URLSearchParams({ limit: PAGE_SIZE, offset });
  if (search) params.set('search', search);
  if (status) params.set('status', status);

  try {
    const res  = await fetch(`/admin/api/orders?${params}`, { credentials:'include' });
    const data = await res.json();
    if (!data.success) return;

    currentOrders = data.orders; // internal_id is a safe BOG-XXXXXXXXXX format, used as the lookup key below

    const tbody = document.getElementById('ordersTableBody');
    if (!data.orders.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-secondary)">No orders found</td></tr>';
    } else {
      tbody.innerHTML = data.orders.map(o => `
        <tr>
          <td class="mono">${esc(o.internal_id)}</td>
          <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(o.service_name) || '—'}</td>
          <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis">${esc(o.email)}</td>
          <td>${Number(o.quantity).toLocaleString()}</td>
          <td>GHS ${(o.amount/100).toFixed(2)}</td>
          <td><span class="badge badge-${safeStatusClass(o.status)}">${esc(o.status).replace('fulfillment_','')}</span></td>
          <td style="white-space:nowrap">${new Date(o.created_at).toLocaleDateString('en-GH')}</td>
          <td>
            <div class="table-actions">
              <button class="btn btn-outline btn-sm" data-action="view" data-id="${esc(o.internal_id)}">👁</button>
              ${o.status==='fulfillment_failed'?`<button class="btn btn-success btn-sm" data-action="retry" data-id="${esc(o.internal_id)}">↺</button>`:''}
              ${o.status==='fulfilled'&&o.smmwiz_order_id?`<button class="btn btn-outline btn-sm" data-action="refill" data-id="${esc(o.internal_id)}">♻</button>`:''}
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${esc(o.internal_id)}">🗑</button>
            </div>
          </td>
        </tr>`).join('');
    }

    const totalPages = Math.ceil(data.total / PAGE_SIZE);
    document.getElementById('pageInfo').textContent = `Page ${ordersPage+1} of ${Math.max(1,totalPages)} (${data.total} total)`;
    document.getElementById('prevPage').disabled = ordersPage === 0;
    document.getElementById('nextPage').disabled = ordersPage >= totalPages - 1;
  } catch(e) { console.error('loadOrders:', e); }
}

function changePage(dir) { ordersPage = Math.max(0, ordersPage + dir); loadOrders(); }

function viewOrder(internalId) {
  const o = currentOrders.find(x => x.internal_id === internalId);
  if (!o) { toast('Order not found on this page — try refreshing', 'error'); return; }
  // Every value below can originate from a customer (email, link) or a
  // third-party supplier (service_name) — escape all of them before they
  // hit innerHTML. Status is safe (fixed enum from the server).
  const rows = [
    ['Order ID',          esc(o.internal_id)],
    ['Payment Reference', esc(o.paystack_ref)],
    ['SMMWiz Order ID',   esc(o.smmwiz_order_id) || '—'],
    ['Service',           esc(o.service_name)],
    ['Platform',          esc(o.platform)],
    ['Quantity',          Number(o.quantity).toLocaleString()],
    ['Link',              esc(o.link)],
    ['Email',             esc(o.email)],
    ['Amount',            `GHS ${(o.amount/100).toFixed(2)}`],
    ['Status',            `<span class="badge badge-${safeStatusClass(o.status)}">${esc(o.status)}</span>`],
    ['Est. Delivery',     esc(o.estimated_delivery) || '—'],
    ['Created',           new Date(o.created_at).toLocaleString('en-GH')],
    ['Fulfilled At',      o.fulfilled_at ? new Date(o.fulfilled_at).toLocaleString('en-GH') : '—'],
    ['Error',             esc(o.exo_error) || '—'],
    ['Email Sent',        o.email_sent ? '✅ Yes' : '❌ No'],
  ];
  const html = rows.map(([l,v]) => `<div class="modal-detail-row"><span class="modal-detail-label">${l}</span><span style="word-break:break-all">${v}</span></div>`).join('');
  openModal('Order Details — ' + esc(o.internal_id), html);
}

async function retryOrder(id) {
  if (!confirm(`Retry fulfillment for ${id}?`)) return;
  try {
    const res  = await fetch(`/admin/api/retry/${id}`, { method:'POST', credentials:'include' });
    const data = await res.json();
    if (data.success) { toast('Order fulfilled! SMMWiz ID: ' + data.exoOrderId, 'success'); loadOrders(); }
    else toast('Retry failed: ' + data.error, 'error');
  } catch(e) { toast('Network error', 'error'); }
}

async function refillOrder(id) {
  if (!confirm(`Request refill for ${id}?`)) return;
  try {
    const res  = await fetch(`/admin/api/refill/${id}`, { method:'POST', credentials:'include' });
    const data = await res.json();
    if (data.success) toast('Refill requested successfully', 'success');
    else toast('Refill failed: ' + data.error, 'error');
  } catch(e) { toast('Network error', 'error'); }
}

async function deleteOrder(id) {
  const password = await confirmWithPassword(`Delete order ${id}? This cannot be undone.`);
  if (!password) return;
  try {
    const res  = await fetch(`/admin/delete-order/${id}`, {
      method:'DELETE', credentials:'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: password }),
    });
    const data = await res.json();
    if (data.success) { toast('Order deleted', 'success'); loadOrders(); }
    else toast('Delete failed: ' + data.error, 'error');
  } catch(e) { toast('Network error', 'error'); }
}

async function clearAllOrders() {
  const password = await confirmWithPassword('Delete ALL orders permanently? This cannot be undone. Enter your password to confirm.');
  if (!password) return;
  try {
    const res  = await fetch('/admin/clear-all-orders', {
      method:'POST', credentials:'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: password }),
    });
    const data = await res.json();
    if (data.success) { toast(`Cleared ${data.deleted} orders`, 'success'); loadOrders(); }
    else toast('Failed: ' + data.error, 'error');
  } catch(e) { toast('Network error', 'error'); }
}

// ─── SERVICES ──────────────────────────────────────────────────────────────
let smmwizRawServices = [];

async function loadServices() {
  try {
    const res  = await fetch('/admin/api/services', { credentials:'include' });
    const data = await res.json();
    if (!data.success) return;
    const tbody = document.getElementById('servicesTableBody');
    if (!data.services.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-secondary)">No services mapped yet. Click "Sync from SMMWiz" to get started.</td></tr>';
      return;
    }
    tbody.innerHTML = data.services.map(s => `
      <tr>
        <td class="mono" style="font-size:12px">${s.smmwiz_id}</td>
        <td style="max-width:200px;font-size:13px">${esc(s.name)}</td>
        <td style="font-size:13px">${esc(s.platform)}</td>
        <td style="font-size:13px">${Number(s.min_quantity).toLocaleString()}</td>
        <td style="font-size:13px">${Number(s.max_quantity).toLocaleString()}</td>
        <td style="font-size:13px">$${parseFloat(s.smmwiz_price_per_1000).toFixed(4)}</td>
        <td>
          <div class="inline-edit">
            <input type="number" id="markup-${s.id}" value="${parseFloat(s.markup_multiplier).toFixed(2)}" step="0.01" min="1">
            <button class="btn btn-outline btn-sm" data-action="markup" data-id="${s.id}">✓</button>
          </div>
        </td>
        <td style="font-weight:700;color:var(--accent-cyan)">GHS ${s.ghs_price_per_1000.toFixed(2)}</td>
        <td>
          <div style="display:flex;gap:6px;align-items:center">
            <label class="toggle">
              <input type="checkbox" ${s.is_active?'checked':''} data-action="toggle" data-id="${s.id}">
              <span class="toggle-slider"></span>
            </label>
            <button class="btn btn-outline btn-sm" data-action="editsmmwiz"
              data-id="${s.id}" data-smmwiz="${s.smmwiz_id}"
              data-name="${esc(s.name)}"
              data-price="${s.smmwiz_price_per_1000}"
              title="Change SMMWiz ID" style="padding:4px 8px;font-size:11px">✏️ ID</button>
          </div>
        </td>
      </tr>`).join('');
  } catch(e) { console.error('loadServices:', e); }
}

// ── Edit SMMWiz ID Modal ───────────────────────────────────────────────────
function openEditSmmwizModal(id, currentSmmwizId, currentName, currentPrice) {
  const body = `
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:18px">
      Update the SMMWiz service ID for this service. The new ID must exist on SMMWiz.
      Your markup is <strong>never changed</strong>.
    </p>
    <div class="form-group" style="margin-bottom:14px">
      <label class="admin-label">Service Name</label>
      <input type="text" class="admin-input" id="editSmmwizName"
        value="${esc(currentName)}" placeholder="Display name">
    </div>
    <div class="form-group" style="margin-bottom:14px">
      <label class="admin-label">New SMMWiz Service ID</label>
      <input type="number" class="admin-input" id="editSmmwizId"
        value="${currentSmmwizId}" placeholder="e.g. 21299">
      <div style="font-size:12px;color:var(--text-secondary);margin-top:5px">
        Current ID: <strong style="color:var(--accent-cyan)">${currentSmmwizId}</strong>
        — Find new IDs in the Sync panel above
      </div>
    </div>
    <div class="form-group" style="margin-bottom:14px">
      <label class="admin-label">New USD Price per 1K (optional)</label>
      <input type="number" class="admin-input" id="editSmmwizPrice"
        value="${parseFloat(currentPrice).toFixed(4)}" step="0.0001" min="0"
        placeholder="Leave as-is or enter new price">
      <div style="font-size:12px;color:var(--text-secondary);margin-top:5px">
        Update this if the new service has a different price
      </div>
    </div>
    <div id="editSmmwizAlert" style="display:none;margin-bottom:10px"></div>
    <div style="display:flex;gap:10px;margin-top:6px">
      <button class="btn btn-primary" id="confirmEditSmmwiz">Save Changes</button>
      <button class="btn btn-outline" id="cancelEditSmmwiz">Cancel</button>
    </div>`;

  openModal('✏️ Change SMMWiz Service ID', body);

  // Wire buttons inside modal
  document.getElementById('cancelEditSmmwiz').addEventListener('click', closeModal);

  document.getElementById('confirmEditSmmwiz').addEventListener('click', async () => {
    const newId    = parseInt(document.getElementById('editSmmwizId').value, 10);
    const newName  = document.getElementById('editSmmwizName').value.trim();
    const newPrice = parseFloat(document.getElementById('editSmmwizPrice').value);
    const alertEl  = document.getElementById('editSmmwizAlert');

    alertEl.style.display = 'none';

    if (!newId || isNaN(newId)) {
      alertEl.className = 'alert alert-error';
      alertEl.textContent = 'Please enter a valid SMMWiz service ID number.';
      alertEl.style.display = 'block';
      return;
    }

    const saveBtn = document.getElementById('confirmEditSmmwiz');
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Saving…';

    try {
      const res  = await fetch(`/admin/api/services/${id}/smmwiz`, {
        method:  'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smmwizId: newId,
          name:     newName,
          price:    isNaN(newPrice) ? undefined : newPrice,
        }),
      });
      const data = await res.json();

      if (data.success) {
        closeModal();
        toast(`✅ SMMWiz ID updated to ${newId} successfully`, 'success');
        loadServices(); // Refresh the table
      } else {
        alertEl.className = 'alert alert-error';
        alertEl.textContent = data.error;
        alertEl.style.display = 'block';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
      }
    } catch(e) {
      alertEl.className = 'alert alert-error';
      alertEl.textContent = 'Network error. Please try again.';
      alertEl.style.display = 'block';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  });
}

async function syncServices() {
  const btn = document.getElementById('syncServicesBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Syncing…'; }
  document.getElementById('syncResult').innerHTML = '';
  try {
    const res  = await fetch('/admin/api/services/sync', { method:'POST', credentials:'include' });
    const data = await res.json();
    if (!data.success) { toast('Sync failed: ' + data.error, 'error'); return; }
    smmwizRawServices = data.services;
    document.getElementById('syncServicesList').style.display = 'block';
    document.getElementById('syncResult').innerHTML =
      `<div class="alert alert-success">✅ Fetched ${data.services.length} services from SMMWiz. Choose how to import below.</div>`;
    // Default to By Platform tab
    showSyncTab('byPlatform');
    buildPlatformFilterBtns();
    buildBulkPlatformGrid();
    renderSmmwizRaw(data.services);
  } catch(e) { toast('Network error', 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '🔄 Sync from SMMWiz'; } }
}

// ── Tab switching ──────────────────────────────────────────────────────────
function showSyncTab(tab) {
  document.getElementById('panelByPlatform').style.display  = tab === 'byPlatform'  ? 'block' : 'none';
  document.getElementById('panelBulkImport').style.display  = tab === 'bulkImport'  ? 'block' : 'none';
  document.getElementById('panelManual').style.display      = tab === 'manual'      ? 'block' : 'none';
  // Update tab button styles
  const tabs = { byPlatform:'tabByPlatform', bulkImport:'tabBulkImport', manual:'tabManual' };
  for (const [key, id] of Object.entries(tabs)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.className = key === tab ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
  }
}

// ── Option 1: By Platform ─────────────────────────────────────────────────
const PLATFORM_NAMES = {
  tiktok:'TikTok', instagram:'Instagram', youtube:'YouTube',
  facebook:'Facebook', telegram:'Telegram', twitter:'Twitter/X',
  spotify:'Spotify', snapchat:'Snapchat',
};

function buildPlatformFilterBtns() {
  const platforms = [...new Set(smmwizRawServices.map(s => guessPlatform(s.name)).filter(p => p !== 'other'))];
  const container = document.getElementById('platformFilterBtns');
  if (!container) return;
  container.innerHTML = platforms.map(p =>
    `<button class="btn btn-outline btn-sm" data-platform-filter="${p}">
      ${PLATFORM_NAMES[p] || p}
      <span style="opacity:.6;margin-left:4px;font-size:11px">
        (${smmwizRawServices.filter(s => guessPlatform(s.name) === p).length})
      </span>
    </button>`
  ).join('');
  container.querySelectorAll('[data-platform-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-platform-filter]').forEach(b => b.className = 'btn btn-outline btn-sm');
      btn.className = 'btn btn-primary btn-sm';
      showPlatformPreview(btn.dataset.platformFilter);
    });
  });
}

function showPlatformPreview(platform) {
  const filtered = smmwizRawServices.filter(s => guessPlatform(s.name) === platform);
  const preview  = document.getElementById('platformPreview');
  const tbody    = document.getElementById('platformPreviewBody');
  if (!preview || !tbody) return;

  tbody.innerHTML = filtered.map(s => {
    const category = guessCategory(s.name);
    const markup   = DEFAULT_MARKUP[category] || 1.40;
    return `<tr>
      <td><input type="checkbox" class="platform-check" data-id="${esc(s.service)}" checked></td>
      <td class="mono" style="font-size:11px">${esc(s.service)}</td>
      <td style="font-size:12px;max-width:220px">${esc(s.name)}</td>
      <td style="font-size:12px">${category}</td>
      <td style="font-size:12px">${Number(s.min).toLocaleString()}</td>
      <td style="font-size:12px">${Number(s.max).toLocaleString()}</td>
      <td style="font-size:12px">$${parseFloat(s.rate).toFixed(4)}</td>
      <td><input type="number" class="platform-markup" data-id="${esc(s.service)}"
          value="${markup}" step="0.01" min="1"
          style="width:60px;background:#1a2235;color:#f1f5f9;border:1px solid #222;border-radius:6px;padding:3px 6px;font-size:12px"></td>
    </tr>`;
  }).join('');

  preview.style.display = 'block';
  preview.dataset.platform = platform;
}

// ── Option 2: Bulk Import ─────────────────────────────────────────────────
function buildBulkPlatformGrid() {
  const platforms = [...new Set(smmwizRawServices.map(s => guessPlatform(s.name)).filter(p => p !== 'other'))];
  const grid = document.getElementById('bulkPlatformGrid');
  if (!grid) return;
  grid.innerHTML = platforms.map(p => {
    const count = smmwizRawServices.filter(s => guessPlatform(s.name) === p).length;
    return `<button class="btn btn-outline btn-sm" data-bulk-platform="${p}"
        style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 10px;height:auto">
      <span style="font-size:15px">${platformEmoji(p)}</span>
      <span>${PLATFORM_NAMES[p] || p}</span>
      <span style="font-size:11px;opacity:.6">${count} services</span>
    </button>`;
  }).join('');

  grid.querySelectorAll('[data-bulk-platform]').forEach(btn => {
    btn.addEventListener('click', () => bulkImportPlatform(btn.dataset.bulkPlatform, btn));
  });
}

function platformEmoji(p) {
  return { tiktok:'🎵', instagram:'📸', youtube:'▶️', facebook:'👍',
           telegram:'✈️', twitter:'🐦', spotify:'🎧', snapchat:'👻' }[p] || '🌐';
}

async function bulkImportPlatform(platform, btn) {
  if (!confirm(`Import ALL ${smmwizRawServices.filter(s => guessPlatform(s.name) === platform).length} ${PLATFORM_NAMES[platform] || platform} services with default markups?`)) return;

  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Importing…';

  const filtered = smmwizRawServices.filter(s => guessPlatform(s.name) === platform);
  const services = filtered.map(s => {
    const category = guessCategory(s.name);
    return {
      smmwizId: s.service, name: s.name, platform,
      category, minQty: s.min, maxQty: s.max,
      price: s.rate, markup: DEFAULT_MARKUP[category] || 1.40,
    };
  });

  try {
    const res  = await fetch('/admin/api/services/import', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ services }),
    });
    const data = await res.json();
    const resultEl = document.getElementById('bulkResult');
    if (data.success) {
      const skipNote = data.skipped ? ` (${data.skipped} skipped — check console for details)` : '';
      if (data.skipped) console.warn('Import skipped rows:', data.skippedDetails);
      if (resultEl) resultEl.innerHTML =
        `<div class="alert alert-success">✅ Imported ${data.imported} ${PLATFORM_NAMES[platform] || platform} services successfully.${esc(skipNote)}</div>`;
      loadServices();
    } else {
      if (resultEl) resultEl.innerHTML = `<div class="alert alert-error">❌ ${esc(data.error)}</div>`;
    }
  } catch(e) { toast('Network error', 'error'); }
  finally { btn.disabled = false; btn.textContent = origText; }
}

// ── Option 3: Manual (improved with platform filter) ──────────────────────
const DEFAULT_MARKUP = {
  followers:1.55, likes:1.45, views:1.35, members:1.55,
  comments:1.45,  shares:1.40, other:1.40,
};

function guessPlatform(name) {
  const n = name.toLowerCase();
  if (n.includes('tiktok'))                        return 'tiktok';
  if (n.includes('instagram'))                     return 'instagram';
  if (n.includes('youtube'))                       return 'youtube';
  if (n.includes('facebook'))                      return 'facebook';
  if (n.includes('telegram'))                      return 'telegram';
  if (n.includes('snapchat'))                      return 'snapchat';
  if (n.includes('twitter') || n.includes(' x ')) return 'twitter';
  if (n.includes('spotify'))                       return 'spotify';
  return 'other';
}

function guessCategory(name) {
  const n = name.toLowerCase();
  const cats = ['followers','likes','views','members','comments','shares','subscribers','saves'];
  for (const c of cats) { if (n.includes(c)) return c; }
  return 'other';
}

function renderSmmwizRaw(services) {
  const tbody = document.getElementById('smmwizRawBody');
  if (!tbody) return;
  tbody.innerHTML = services.map(s => {
    const platform = guessPlatform(s.name);
    const category = guessCategory(s.name);
    const markup   = DEFAULT_MARKUP[category] || 1.40;
    return `<tr id="smmrow-${esc(s.service)}" data-platform="${esc(platform)}">
      <td><input type="checkbox" class="smm-check" data-id="${esc(s.service)}"></td>
      <td class="mono" style="font-size:11px">${esc(s.service)}</td>
      <td style="max-width:240px;font-size:12px">${esc(s.name)}</td>
      <td style="font-size:12px">${category}</td>
      <td style="font-size:12px">${Number(s.min).toLocaleString()}</td>
      <td style="font-size:12px">${Number(s.max).toLocaleString()}</td>
      <td style="font-size:12px">$${parseFloat(s.rate).toFixed(4)}</td>
      <td><select class="smm-platform" data-id="${esc(s.service)}"
          style="background:#1a2235;color:#f1f5f9;border:1px solid #222;border-radius:6px;padding:3px 6px;font-size:12px">
        ${['tiktok','instagram','youtube','facebook','telegram','snapchat','twitter','spotify','other']
          .map(p=>`<option value="${p}" ${p===platform?'selected':''}>${p}</option>`).join('')}
      </select></td>
      <td><input type="number" class="smm-markup" data-id="${esc(s.service)}"
          value="${markup}" step="0.01" min="1"
          style="width:60px;background:#1a2235;color:#f1f5f9;border:1px solid #222;border-radius:6px;padding:3px 6px;font-size:12px"></td>
    </tr>`;
  }).join('');
}

function filterSmmwizList() {
  const q = (document.getElementById('smmwizSearchInput').value || '').toLowerCase();
  const p = (document.getElementById('smmwizPlatformFilter') || {}).value || '';
  document.querySelectorAll('#smmwizRawBody tr').forEach(tr => {
    const textMatch     = !q || tr.textContent.toLowerCase().includes(q);
    const platformMatch = !p || tr.dataset.platform === p;
    tr.style.display    = textMatch && platformMatch ? '' : 'none';
  });
}

function toggleCheckAll(cb) {
  document.querySelectorAll('.smm-check').forEach(c => { c.checked = cb.checked; });
}

async function importSelected() {
  const checked = [...document.querySelectorAll('.smm-check:checked')].map(c => c.dataset.id);
  if (!checked.length) { toast('Select at least one service to import', 'error'); return; }
  const services = checked.map(id => {
    const raw      = smmwizRawServices.find(s => String(s.service) === String(id));
    const platform = (document.querySelector(`.smm-platform[data-id="${id}"]`) || {}).value || guessPlatform(raw.name);
    const markup   = (document.querySelector(`.smm-markup[data-id="${id}"]`)   || {}).value || 1.45;
    const category = guessCategory(raw.name);
    return { smmwizId:id, name:raw.name, platform, category, minQty:raw.min, maxQty:raw.max, price:raw.rate, markup };
  });
  try {
    const res  = await fetch('/admin/api/services/import', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ services }),
    });
    const data = await res.json();
    if (data.success) {
      toast(`✅ Imported ${data.imported} services` + (data.skipped ? ` (${data.skipped} skipped)` : ''), 'success');
      if (data.skipped) console.warn('Import skipped rows:', data.skippedDetails);
      document.getElementById('syncServicesList').style.display = 'none';
      loadServices();
    } else toast('Import failed: ' + data.error, 'error');
  } catch(e) { toast('Network error', 'error'); }
}

async function importPlatformSelected() {
  const platform = document.getElementById('platformPreview').dataset.platform;
  const checked  = [...document.querySelectorAll('.platform-check:checked')].map(c => c.dataset.id);
  if (!checked.length) { toast('No services selected', 'error'); return; }
  const services = checked.map(id => {
    const raw      = smmwizRawServices.find(s => String(s.service) === String(id));
    const markup   = (document.querySelector(`.platform-markup[data-id="${id}"]`) || {}).value || 1.45;
    const category = guessCategory(raw.name);
    return { smmwizId:id, name:raw.name, platform, category, minQty:raw.min, maxQty:raw.max, price:raw.rate, markup };
  });
  try {
    const res  = await fetch('/admin/api/services/import', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ services }),
    });
    const data = await res.json();
    if (data.success) {
      toast(`✅ Imported ${data.imported} services` + (data.skipped ? ` (${data.skipped} skipped)` : ''), 'success');
      if (data.skipped) console.warn('Import skipped rows:', data.skippedDetails);
      loadServices();
    } else toast('Import failed: ' + data.error, 'error');
  } catch(e) { toast('Network error', 'error'); }
}

async function toggleService(id, isActive) {
  try {
    const res  = await fetch(`/admin/api/services/${id}/toggle`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ isActive }),
    });
    const data = await res.json();
    if (!data.success) toast('Toggle failed: ' + data.error, 'error');
  } catch(e) { toast('Network error', 'error'); }
}

async function saveMarkup(id) {
  const markup = parseFloat(document.getElementById('markup-' + id).value);
  if (isNaN(markup) || markup <= 0) { toast('Invalid markup value', 'error'); return; }
  try {
    const res  = await fetch(`/admin/api/services/${id}/markup`, {
      method:'PUT', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ markup }),
    });
    const data = await res.json();
    if (data.success) { toast('Markup updated', 'success'); loadServices(); }
    else toast('Failed: ' + data.error, 'error');
  } catch(e) { toast('Network error', 'error'); }
}

// ─── SETTINGS ──────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const res  = await fetch('/admin/api/settings', { credentials:'include' });
    const data = await res.json();
    if (!data.success) return;
    const s = data.settings;
    document.getElementById('settingRate').value      = s.usd_to_ghs_rate || '';
    document.getElementById('settingSiteName').value  = s.site_name || '';
    document.getElementById('settingWhatsapp').value  = s.whatsapp_number || '';
    document.getElementById('settingThreshold').value = s.low_balance_threshold || '10';
    document.getElementById('currentRateDisplay').textContent =
      `Current rate: 1 USD = GHS ${s.usd_to_ghs_rate || '—'}`;

    // Load price sync status
    loadSyncStatus();
  } catch(e) { console.error('loadSettings:', e); }
}

async function loadSyncStatus() {
  try {
    const res    = await fetch('/admin/api/settings', { credentials:'include' });
    const data   = await res.json();
    if (!data.success) return;

    const lastSyncRaw = data.settings.last_price_sync || '';
    const alerts      = data.settings.price_sync_alerts || '';

    const lastEl = document.getElementById('lastSyncTime');
    const nextEl = document.getElementById('nextSyncTime');

    if (lastSyncRaw) {
      const lastDate = new Date(lastSyncRaw);
      const nextDate = new Date(lastDate.getTime() + 6 * 60 * 60 * 1000);
      if (lastEl) lastEl.textContent = lastDate.toLocaleString('en-GH', { timeZone:'Africa/Accra', dateStyle:'medium', timeStyle:'short' });
      if (nextEl) nextEl.textContent = nextDate.toLocaleString('en-GH', { timeZone:'Africa/Accra', dateStyle:'medium', timeStyle:'short' });
    } else {
      if (lastEl) lastEl.textContent = 'Syncing on startup…';
      if (nextEl) nextEl.textContent = '—';
    }

    const alertsEl = document.getElementById('priceSyncAlerts');
    if (alertsEl) {
      if (alerts) {
        alertsEl.style.display = 'block';
        alertsEl.innerHTML = `<div class="alert alert-warning">
          <strong>⚠️ Price Increase Alerts</strong><br>
          The following services had significant price increases from SMMWiz.<br>
          Review your markups to protect your margins:<br><br>
          <pre style="margin:0;font-size:12px;white-space:pre-wrap">${esc(alerts)}</pre>
        </div>`;
      } else {
        alertsEl.style.display = 'none';
      }
    }
  } catch(e) { console.error('loadSyncStatus:', e); }
}

async function saveSettings(group) {
  const body = {};
  if (group === 'rate') {
    const rate = parseFloat(document.getElementById('settingRate').value);
    if (isNaN(rate) || rate <= 0) { showSettingsAlert('Please enter a valid rate', 'error'); return; }
    body.usd_to_ghs_rate = String(rate);
  } else {
    body.site_name            = document.getElementById('settingSiteName').value.trim();
    body.whatsapp_number      = document.getElementById('settingWhatsapp').value.trim();
    body.low_balance_threshold= document.getElementById('settingThreshold').value.trim();
  }
  try {
    const res  = await fetch('/admin/api/settings', {
      method:'PUT', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) { showSettingsAlert('Settings saved successfully', 'success'); loadSettings(); }
    else showSettingsAlert('Failed: ' + data.error, 'error');
  } catch(e) { showSettingsAlert('Network error', 'error'); }
}

function showSettingsAlert(msg, type) {
  const el = document.getElementById('settingsAlert');
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 4000);
}

// ─── CREDENTIALS ───────────────────────────────────────────────────────────
async function changeCredentials() {
  const currentPassword = document.getElementById('credCurrentPw').value;
  const newUsername     = document.getElementById('credNewUser').value.trim();
  const newPassword     = document.getElementById('credNewPw').value;
  const alertEl         = document.getElementById('credAlert');

  alertEl.style.display = 'none';
  if (!currentPassword) { showCredAlert('Current password is required', 'error'); return; }
  if (!newUsername && !newPassword) { showCredAlert('Provide a new username, password, or both', 'error'); return; }

  try {
    const res  = await fetch('/admin/change-credentials', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ currentPassword, newUsername, newPassword }),
    });
    const data = await res.json();
    if (data.success) {
      showCredAlert(data.message || 'Credentials updated. Redirecting…', 'success');
      setTimeout(() => window.location.href = '/admin/login', 1800);
    } else showCredAlert(data.error, 'error');
  } catch(e) { showCredAlert('Network error', 'error'); }
}

function showCredAlert(msg, type) {
  const el = document.getElementById('credAlert');
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.style.display = 'block';
}

// ─── WIRE ALL DASHBOARD EVENT LISTENERS ───────────────────────────────────
function initDashboardListeners() {  // Sidebar overlay — close on click
  const overlay = document.getElementById('sidebarOverlay');
  if (overlay) overlay.addEventListener('click', closeSidebar);

  // Orders table action buttons — registered once here via event delegation,
  // not re-added inside loadOrders(). Re-binding on every refresh meant that
  // two loads firing close together (e.g. search debounce overlapping a
  // manual refresh) could stack two listeners on the same tbody, so a single
  // click would fire the action twice (two DELETE requests, etc).
  const ordersBody = document.getElementById('ordersTableBody');
  if (ordersBody) {
    ordersBody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'view')   viewOrder(btn.dataset.id);
      if (action === 'retry')  retryOrder(btn.dataset.id);
      if (action === 'refill') refillOrder(btn.dataset.id);
      if (action === 'delete') deleteOrder(btn.dataset.id);
    });
  }

  // Services table markup/toggle/edit buttons — same fix as orders above.
  // loadServices() used to re-add these on every call with no {once:true} at
  // all, so listeners accumulated permanently — after N refreshes a single
  // click fired the handler N times (saveMarkup called N times, etc).
  const servicesBody = document.getElementById('servicesTableBody');
  if (servicesBody) {
    servicesBody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="markup"]');
      if (btn) saveMarkup(parseInt(btn.dataset.id));

      const editBtn = e.target.closest('[data-action="editsmmwiz"]');
      if (editBtn) openEditSmmwizModal(
        parseInt(editBtn.dataset.id),
        editBtn.dataset.smmwiz,
        editBtn.dataset.name,
        editBtn.dataset.price
      );
    });
    servicesBody.addEventListener('change', (e) => {
      const chk = e.target.closest('[data-action="toggle"]');
      if (chk) toggleService(parseInt(chk.dataset.id), chk.checked);
    });
  }

  // Modal overlay — close when clicking background
  const modalBg = document.getElementById('modalOverlay');
  if (modalBg) modalBg.addEventListener('click', (e) => { if (e.target === modalBg) closeModal(); });

  // Modal close button
  const modalClose = document.getElementById('modalCloseBtn');
  if (modalClose) modalClose.addEventListener('click', closeModal);

  // Sidebar nav links
  document.querySelectorAll('[data-section]').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
  });

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', doLogout);

  // Admin hamburger
  const hamburger = document.getElementById('adminHamburger');
  if (hamburger) hamburger.addEventListener('click', openSidebar);

  // Orders section
  const clearAllBtn = document.getElementById('clearAllBtn');
  if (clearAllBtn) clearAllBtn.addEventListener('click', clearAllOrders);

  const refreshBtn = document.getElementById('refreshOrdersBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadOrders);

  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', debounceLoad);

  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) statusFilter.addEventListener('change', loadOrders);

  const prevPage = document.getElementById('prevPage');
  if (prevPage) prevPage.addEventListener('click', () => changePage(-1));

  const nextPage = document.getElementById('nextPage');
  if (nextPage) nextPage.addEventListener('click', () => changePage(1));

  // CSV export
  const exportBtn = document.getElementById('exportCsvBtn') ||
    document.querySelector('a[href="/admin/api/export/csv"]');
  // Export is an <a> tag, leave as-is

  // Services section
  const syncBtn = document.getElementById('syncServicesBtn');
  if (syncBtn) syncBtn.addEventListener('click', syncServices);

  const smmwizSearch = document.getElementById('smmwizSearchInput');
  if (smmwizSearch) smmwizSearch.addEventListener('input', filterSmmwizList);

  const smmwizPlatformFilter = document.getElementById('smmwizPlatformFilter');
  if (smmwizPlatformFilter) smmwizPlatformFilter.addEventListener('change', filterSmmwizList);

  const checkAll = document.getElementById('checkAll');
  if (checkAll) checkAll.addEventListener('change', () => toggleCheckAll(checkAll));

  const checkAllPlatform = document.getElementById('checkAllPlatform');
  if (checkAllPlatform) checkAllPlatform.addEventListener('change', () => {
    document.querySelectorAll('.platform-check').forEach(c => { c.checked = checkAllPlatform.checked; });
  });

  const importSelectedBtn = document.getElementById('importSelectedBtn');
  if (importSelectedBtn) importSelectedBtn.addEventListener('click', importSelected);

  const importPlatformBtn = document.getElementById('importPlatformBtn');
  if (importPlatformBtn) importPlatformBtn.addEventListener('click', importPlatformSelected);

  const selectAllPlatformBtn = document.getElementById('selectAllPlatformBtn');
  if (selectAllPlatformBtn) selectAllPlatformBtn.addEventListener('click', () => {
    document.querySelectorAll('.platform-check').forEach(c => { c.checked = true; });
  });

  const deselectAllPlatformBtn = document.getElementById('deselectAllPlatformBtn');
  if (deselectAllPlatformBtn) deselectAllPlatformBtn.addEventListener('click', () => {
    document.querySelectorAll('.platform-check').forEach(c => { c.checked = false; });
  });

  const cancelSyncBtn = document.getElementById('cancelSyncBtn');
  if (cancelSyncBtn) cancelSyncBtn.addEventListener('click', () => {
    document.getElementById('syncServicesList').style.display = 'none';
    document.getElementById('syncResult').innerHTML = '';
  });

  // Sync tab switchers
  const tabByPlatform = document.getElementById('tabByPlatform');
  if (tabByPlatform) tabByPlatform.addEventListener('click', () => showSyncTab('byPlatform'));

  const tabBulkImport = document.getElementById('tabBulkImport');
  if (tabBulkImport) tabBulkImport.addEventListener('click', () => showSyncTab('bulkImport'));

  const tabManual = document.getElementById('tabManual');
  if (tabManual) tabManual.addEventListener('click', () => showSyncTab('manual'));

  // Settings section
  const saveRateBtn = document.getElementById('saveRateBtn');
  if (saveRateBtn) saveRateBtn.addEventListener('click', () => saveSettings('rate'));

  const saveSiteBtn = document.getElementById('saveSiteBtn');
  if (saveSiteBtn) saveSiteBtn.addEventListener('click', () => saveSettings('site'));

  // Force price sync button
  const forceSyncBtn = document.getElementById('forceSyncBtn');
  if (forceSyncBtn) {
    forceSyncBtn.addEventListener('click', async () => {
      forceSyncBtn.disabled = true;
      forceSyncBtn.textContent = '⏳ Syncing prices…';
      try {
        const res  = await fetch('/admin/api/prices/sync', { method:'POST', credentials:'include' });
        const data = await res.json();
        if (data.success) {
          toast('✅ Prices synced successfully from SMMWiz', 'success');
          loadSyncStatus();
          // Reload services table to show updated prices
          loadServices();
        } else {
          toast('Sync failed: ' + data.error, 'error');
        }
      } catch(e) {
        toast('Network error during sync', 'error');
      } finally {
        forceSyncBtn.disabled = false;
        forceSyncBtn.textContent = '⚡ Force Sync Now';
      }
    });
  }

  // Credentials section
  const saveCredsBtn = document.getElementById('saveCredsBtn');
  if (saveCredsBtn) saveCredsBtn.addEventListener('click', changeCredentials);
}

// ─── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Auth guard — redirect to login if session invalid
  fetch('/admin/api/me', { credentials: 'include' })
    .then(r => r.json())
    .then(d => {
      if (!d.success) {
        window.location.href = '/admin/login';
      } else {
        const el = document.getElementById('adminUsernameDisplay');
        if (el) el.textContent = '👤 ' + d.username;
      }
    })
    .catch(() => { window.location.href = '/admin/login'; });

  initDashboardListeners();
  loadOverview();
});