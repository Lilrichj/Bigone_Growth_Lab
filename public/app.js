// ─── ESCAPE HELPER ─────────────────────────────────────────────────────────
// Service name/id ultimately trace back to SMMWiz (a third party) via admin
// import. Escape before inserting into innerHTML so a malicious or malformed
// supplier response can't inject HTML into the public storefront.
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ─── PLATFORM SVG ICONS ────────────────────────────────────────────────────
const PLATFORMS = {
  tiktok: {
    label: 'TikTok', color: '#010101',
    svg: `<svg viewBox="0 0 24 24" fill="#010101" xmlns="http://www.w3.org/2000/svg"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.78a4.85 4.85 0 0 1-1.01-.09z"/></svg>`
  },
  instagram: {
    label: 'Instagram', color: '#E1306C',
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#E1306C" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>`
  },
  youtube: {
    label: 'YouTube', color: '#FF0000',
    svg: `<svg viewBox="0 0 24 24" fill="#FF0000" xmlns="http://www.w3.org/2000/svg"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`
  },
  facebook: {
    label: 'Facebook', color: '#1877F2',
    svg: `<svg viewBox="0 0 24 24" fill="#1877F2" xmlns="http://www.w3.org/2000/svg"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`
  },
  telegram: {
    label: 'Telegram', color: '#2AABEE',
    svg: `<svg viewBox="0 0 24 24" fill="#2AABEE" xmlns="http://www.w3.org/2000/svg"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`
  },
  snapchat: {
    label: 'Snapchat', color: '#FFFC00',
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#FFFC00" d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z"/></svg>`
  },
  twitter: {
    label: 'Twitter/X', color: '#000000',
    svg: `<svg viewBox="0 0 24 24" fill="#000000" xmlns="http://www.w3.org/2000/svg"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`
  },
  spotify: {
    label: 'Spotify', color: '#1DB954',
    svg: `<svg viewBox="0 0 24 24" fill="#1DB954" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`
  }
};

// ─── FAQ DATA ──────────────────────────────────────────────────────────────
const FAQS = [
  ["Is it safe for my account?","Yes. We only use methods that comply with each platform's terms. We never ask for your password or personal login information."],
  ["Do I need to give you my password?","Absolutely not. We never ask for your password. All we need is your public profile or post link."],
  ["How fast will delivery start?","Most orders begin within 1–8 hours of payment. Some services may take up to 24 hours depending on the type and quantity ordered."],
  ["What if my followers or likes drop after delivery?","Some fluctuation is normal as platforms conduct routine reviews. Contact our support team and we will look into it for you."],
  ["What does \"Refill\" (e.g. 30D, 90D, Lifetime) mean?","Refill is a free top-up guarantee. If your followers, likes, or views drop after delivery — which can happen naturally as platforms clean up inactive accounts — we automatically restore the lost amount at no extra cost, within the stated window. 30D Refill covers drops for 30 days, 90D Refill covers 90 days, and Lifetime Refill means the guarantee never expires. Services without a refill tag are delivered as-is with no replacement guarantee."],
  ["What does \"Retention\" mean (e.g. Facebook 15min Retention)?","Retention refers to how long a viewer must watch a video before the view is counted. A \"15min Retention\" view means the viewer engaged with your content for 15 minutes before it qualified, making these views higher quality and more valuable for engagement and monetization than instant low-quality views that disappear quickly."],
  ["What's the difference between Cheapest and Premium services?","Cheapest services are budget-friendly and delivered fast, ideal for quick visibility boosts. Premium services (often labeled HQ, Real, or High Quality) come from more authentic, active-looking profiles, have better long-term stability, and usually include a refill guarantee. Premium costs more but offers better retention and a safer growth profile for your account."],
  ["What do \"Real Quality\" or \"High Quality (HQ)\" mean?","These labels mean the followers, likes, or views come from accounts that appear more genuine and active rather than bulk-generated bot accounts. They carry a lower risk of being removed by the platform and tend to look more natural on your profile, which is why they're priced higher than standard/cheap options."],
  ["What does \"Dripfeed\" delivery mean?","Dripfeed means your order is delivered gradually over a period of time (e.g. 500 followers per day for several days) instead of all at once. This makes the growth look more organic and natural, which some customers prefer over instant bulk delivery."],
  ["Can I order for someone else's account?","Yes. As long as the account is public and you have the correct profile link, you can place an order for any account."],
  ["What payment methods do you accept?","We accept Mobile Money (MTN, Vodafone, AirtelTigo), debit/credit cards, and bank transfers — all powered securely by Korapay."],
  ["What if my order fails or does not complete?","If an order fails, contact us immediately with your Order ID. We will investigate and either retry or resolve the issue promptly."],
  ["Can I cancel an order after placing it?","Orders begin processing immediately after payment. Cancellation is not guaranteed once an order is submitted, but contact us as soon as possible and we will do our best."],
  ["Do you offer refunds?","We do not offer refunds for completed orders. If an order was never delivered, contact support with your Order ID and we will resolve it."],
  ["How do I track my order?","Every order comes with a unique Order ID (e.g. BOG-XXXXXXXX) sent to your email. Visit our Track Order page and enter your Order ID to see real-time status."],
  ["What is the minimum and maximum order quantity?","Each service has its own minimum and maximum quantity, which is clearly shown on the order form before you pay."],
  ["Why is my order still showing as pending?","Orders usually start within minutes. If your order has been pending for more than 30 minutes, please contact us with your Order ID."],
  ["Do you offer bulk discounts?","Not currently, but we are working on bulk pricing options. Follow us for updates."],
  ["Is my payment information secure?","Yes. All payments are processed by Korapay, a PCI-DSS compliant payment provider. We never store your card details."],
  ["How do I contact support?","Use the Contact page on this site, email us at bigonegrowthlab@gmail.com, or use the WhatsApp button in your order confirmation email."],
];

// ─── RECAPTCHA ──────────────────────────────────────────────────────────────
async function getRecaptchaToken(action) {
  try {
    const siteKey = CONFIG_DATA.recaptchaSiteKey;
    if (!siteKey || typeof grecaptcha === 'undefined') return '';
    return await new Promise((resolve) => {
      grecaptcha.ready(() => {
        grecaptcha.execute(siteKey, { action }).then(resolve).catch(() => resolve(''));
      });
    });
  } catch (_) { return ''; }
}

// ─── PUBLIC STATS ──────────────────────────────────────────────────────────
async function loadPublicStats() {
  try {
    const res  = await fetch('/api/stats/public');
    const data = await res.json();
    if (!data.success) return;
    function fmt(n) {
      if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K+';
      return n > 0 ? n + '+' : '0';
    }
    document.getElementById('statOrders').textContent    = fmt(data.ordersCompleted);
    document.getElementById('statCustomers').textContent = fmt(data.happyCustomers);
    document.getElementById('statServices').textContent  = data.servicesAvailable > 0 ? data.servicesAvailable + '+' : '—';
  } catch (_) {
    // Stats failing should never break the page
  }
}
let CONFIG_DATA = { korapayPublicKey:'', currency:'GHS', usdToGhs:15.5, services:[] };
let selectedPlatform = '';
let currentStep = 1;

// ─── NAVIGATION ────────────────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + name);
  if (!target) return;
  target.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.remove('active');
    if (l.textContent.toLowerCase().includes(name === 'home' ? 'home' : name)) {
      l.classList.add('active');
    }
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'services') renderServices();
  if (name === 'pricing')  renderPricing();
  if (name === 'order')    buildPlatformSelectGrid();
}

function toggleMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  const ham  = document.getElementById('hamburgerBtn');
  menu.classList.toggle('open');
  if (ham) ham.classList.toggle('open');
}

function closeMobile() {
  const menu = document.getElementById('mobileMenu');
  const ham  = document.getElementById('hamburgerBtn');
  if (menu) menu.classList.remove('open');
  if (ham)  ham.classList.remove('open');
}

// ─── WIRE ALL EVENT LISTENERS ─────────────────────────────────────────────
function initEventListeners() {
  // Hamburger toggle
  const hamburger = document.getElementById('hamburgerBtn');
  if (hamburger) hamburger.addEventListener('click', toggleMobileMenu);

  // All nav links, hero buttons, AND footer buttons with data-page attribute
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => {
      const page = el.dataset.page;
      showPage(page);
      if (el.dataset.mobile) closeMobile();
    });
  });

  // Order step navigation buttons with data-step
  document.querySelectorAll('[data-step]').forEach(el => {
    el.addEventListener('click', () => goStep(parseInt(el.dataset.step)));
  });

  // Contact submit button
  const contactBtn = document.getElementById('contactBtn');
  if (contactBtn) contactBtn.addEventListener('click', submitContact);

  // Pay button
  const payBtn = document.getElementById('payBtn');
  if (payBtn) payBtn.addEventListener('click', launchPayment);

  // Order form live inputs
  const linkInput  = document.getElementById('linkInput');
  const qtyInput   = document.getElementById('qtyInput');
  const qtySlider  = document.getElementById('qtySlider');
  const emailInput = document.getElementById('emailInput');
  const svcSelect  = document.getElementById('serviceSelect');

  if (linkInput)  linkInput.addEventListener('input',  updateOrderSummary);
  if (qtyInput)   qtyInput.addEventListener('input',   () => { syncSlider(); updateOrderSummary(); });
  if (qtySlider)  qtySlider.addEventListener('input',  () => { syncQty();   updateOrderSummary(); });
  if (emailInput) emailInput.addEventListener('input', validateStep2);
  if (svcSelect)  svcSelect.addEventListener('change', onServiceChange);

  // Close mobile menu when clicking outside
  document.addEventListener('mousedown', (e) => {
    const menu = document.getElementById('mobileMenu');
    const ham  = document.getElementById('hamburgerBtn');
    if (!menu || !ham) return;
    if (menu.classList.contains('open') &&
        !menu.contains(e.target) &&
        !ham.contains(e.target)) {
      closeMobile();
    }
  });
}

// ─── TOAST ─────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.animation = 'toastOut .3s ease forwards'; setTimeout(() => t.remove(), 300); }, 4000);
}

// ─── LOAD CONFIG ───────────────────────────────────────────────────────────
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.success) {
      CONFIG_DATA = data;
      // Dynamically load reCAPTCHA v3 using the site key from server config
      if (data.recaptchaSiteKey && !document.getElementById('recaptcha-script')) {
        const script = document.createElement('script');
        script.id  = 'recaptcha-script';
        script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(data.recaptchaSiteKey)}`;
        script.async = true;
        document.head.appendChild(script);
      }
      renderHeroPlatforms();
      buildPlatformSelectGrid();
      setupWhatsApp(data.whatsappNumber || '');
    }
  } catch (e) {
    console.error('loadConfig error:', e);
  }
}

// ─── WHATSAPP SETUP ────────────────────────────────────────────────────────
function setupWhatsApp(number) {
  const clean = number.replace(/\D/g, '');
  if (!clean) return;

  const url = `https://wa.me/${clean}?text=${encodeURIComponent('Hi! I need help with my BigOne Growth Lab order.')}`;

  // Floating button
  const floatBtn = document.getElementById('whatsappFloat');
  if (floatBtn) {
    floatBtn.href = url;
    floatBtn.style.display = 'flex';
    floatBtn.addEventListener('mouseenter', () => {
      floatBtn.style.transform = 'scale(1.1)';
      floatBtn.style.boxShadow = '0 6px 28px rgba(37,211,102,0.6)';
    });
    floatBtn.addEventListener('mouseleave', () => {
      floatBtn.style.transform = 'scale(1)';
      floatBtn.style.boxShadow = '0 4px 20px rgba(37,211,102,0.45)';
    });
  }

  // Contact page card
  const card = document.getElementById('whatsappContactCard');
  const link = document.getElementById('whatsappContactLink');
  if (card && link) {
    card.style.display = 'flex';
    link.innerHTML = `<a href="${url}" target="_blank" rel="noopener noreferrer"
      style="color:#25D366;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
      💬 Chat on WhatsApp
    </a>`;
  }
}

// ─── HERO PLATFORMS ────────────────────────────────────────────────────────
function renderHeroPlatforms() {
  const activePlatforms = [...new Set(CONFIG_DATA.services.map(s => s.platform))];
  const wrap = document.getElementById('heroPlatforms');
  wrap.innerHTML = (activePlatforms.length ? activePlatforms : Object.keys(PLATFORMS))
    .map(p => {
      const info = PLATFORMS[p] || { label: p, svg: '' };
      // Use data-platform attribute instead of inline onclick to avoid injection
      return `<div class="platform-item" data-platform="${p}" role="button" tabindex="0">
        ${info.svg}<span>${info.label}</span>
      </div>`;
    }).join('');

  // Attach event listeners safely after rendering
  wrap.querySelectorAll('.platform-item').forEach(el => {
    el.addEventListener('click', () => {
      const platform = el.dataset.platform;
      showPage('order');
      selectPlatform(platform);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  });
}

// ─── SERVICES PAGE ─────────────────────────────────────────────────────────
function renderServices(filter = 'all') {
  const services  = CONFIG_DATA.services.filter(s => filter === 'all' || s.platform === filter);
  const platforms = ['all', ...[...new Set(CONFIG_DATA.services.map(s => s.platform))]];

  const tabs = document.getElementById('serviceTabs');
  tabs.innerHTML = platforms.map(p => {
    const label = p === 'all' ? 'All' : (PLATFORMS[p] ? PLATFORMS[p].label : p);
    return `<button class="filter-tab ${p === filter ? 'active' : ''}" data-filter="${p}">${label}</button>`;
  }).join('');

  // Wire filter tab clicks
  tabs.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => renderServices(btn.dataset.filter));
  });

  const grid = document.getElementById('servicesGrid');
  if (!services.length) {
    grid.innerHTML = '<p style="color:var(--text-secondary);padding:32px 0">No services available. Check back soon.</p>';
    return;
  }

  function getTier(s) {
    if (s.id.includes('-premium')) return 'premium';
    if (s.id.includes('-cheap'))   return 'cheapest';
    return null;
  }

  grid.innerHTML = services.map(s => {
    const pInfo = PLATFORMS[s.platform] || { svg: '', label: s.platform };
    const tier  = getTier(s);
    const badge = tier === 'cheapest'
      ? '<span class="tier-badge tier-cheap">🔥 Cheapest</span>'
      : tier === 'premium'
        ? '<span class="tier-badge tier-premium">⭐ Premium</span>'
        : '';
    return `<div class="service-card">
      <div class="service-card-header">${pInfo.svg}<h3>${esc(s.name)}</h3></div>
      ${badge}
      <div class="service-card-price">GHS ${s.pricePerK.toFixed(2)} <span style="font-size:13px;font-weight:400;color:var(--text-secondary)">/ 1K</span></div>
      <div class="service-card-meta">Min: ${s.minQty.toLocaleString()} · Max: ${s.maxQty.toLocaleString()}</div>
      <button class="btn btn-primary btn-sm" data-prefill="${esc(s.id)}">Order Now</button>
    </div>`;
  }).join('');

  // Wire Order Now buttons
  grid.querySelectorAll('[data-prefill]').forEach(btn => {
    btn.addEventListener('click', () => prefillOrder(btn.dataset.prefill));
  });
}

// ─── PRICING TABLE ─────────────────────────────────────────────────────────
function renderPricing() {
  const tbody = document.getElementById('pricingTableBody');
  if (!CONFIG_DATA.services.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:32px;text-align:center;color:var(--text-secondary)">Loading prices…</td></tr>';
    return;
  }
  const byPlatform = {};
  CONFIG_DATA.services.forEach(s => {
    if (!byPlatform[s.platform]) byPlatform[s.platform] = [];
    byPlatform[s.platform].push(s);
  });
  let html = '';
  for (const [platform, svcs] of Object.entries(byPlatform)) {
    const pInfo = PLATFORMS[platform] || { label: platform };
    html += `<tr class="platform-group-header"><td colspan="5">${pInfo.label}</td></tr>`;
    svcs.forEach(s => {
      const tier = s.id.includes('-premium')
        ? '<span class="tier-badge tier-premium" style="margin-left:8px">⭐ Premium</span>'
        : s.id.includes('-cheap')
          ? '<span class="tier-badge tier-cheap" style="margin-left:8px">🔥 Cheapest</span>'
          : '';
      html += `<tr>
        <td>${esc(s.name)}${tier}</td>
        <td style="font-weight:700;color:var(--accent-cyan)">GHS ${s.pricePerK.toFixed(2)}</td>
        <td>${s.minQty.toLocaleString()}</td>
        <td>${s.maxQty.toLocaleString()}</td>
        <td><button class="btn btn-primary btn-sm" data-prefill="${esc(s.id)}">Order</button></td>
      </tr>`;
    });
  }
  tbody.innerHTML = html;

  // Wire Order buttons
  tbody.querySelectorAll('[data-prefill]').forEach(btn => {
    btn.addEventListener('click', () => prefillOrder(btn.dataset.prefill));
  });
}

// ─── ORDER FORM ─────────────────────────────────────────────────────────────
function buildPlatformSelectGrid() {
  const platforms = [...new Set(CONFIG_DATA.services.map(s => s.platform))];
  const grid = document.getElementById('platformSelectGrid');
  if (!grid) return;
  grid.innerHTML = platforms.map(p => {
    const info = PLATFORMS[p] || { label: p, svg: '' };
    return `<button class="platform-btn" id="pbtn-${p}" data-platform="${p}">
      ${info.svg}<span>${info.label}</span>
    </button>`;
  }).join('');

  // Wire platform button clicks via event listeners — no inline onclick
  grid.querySelectorAll('[data-platform]').forEach(btn => {
    btn.addEventListener('click', () => selectPlatform(btn.dataset.platform));
  });
}

function selectPlatform(platform) {
  selectedPlatform = platform;
  document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('selected'));
  const btn = document.getElementById('pbtn-' + platform);
  if (btn) btn.classList.add('selected');
  document.getElementById('btnStep1Next').disabled = false;
  populateServiceDropdown(platform);
  const pInfo = PLATFORMS[platform] || {};
  const placeholders = {
    tiktok:   'https://www.tiktok.com/@yourhandle or video URL',
    instagram:'https://www.instagram.com/yourhandle or post URL',
    youtube:  'https://www.youtube.com/channel/... or video URL',
    facebook: 'https://www.facebook.com/yourpage or post URL',
    telegram: 'https://t.me/yourchannel',
    snapchat: 'https://www.snapchat.com/add/yourhandle',
    twitter:  'https://twitter.com/yourhandle or tweet URL',
    spotify:  'https://open.spotify.com/artist/... or track URL',
  };
  const linkInput = document.getElementById('linkInput');
  linkInput.placeholder = placeholders[platform] || 'Enter your profile or post link';
}

function populateServiceDropdown(platform) {
  const services = CONFIG_DATA.services.filter(s => s.platform === platform);
  const sel = document.getElementById('serviceSelect');
  sel.innerHTML = '<option value="">Select a service…</option>' +
    services.map(s => `<option value="${esc(s.id)}">${esc(s.name)} — GHS ${s.pricePerK.toFixed(2)}/1K</option>`).join('');
  onServiceChange();
}

function onServiceChange() {
  const id = document.getElementById('serviceSelect').value;
  const svc = CONFIG_DATA.services.find(s => s.id === id);
  const hint = document.getElementById('qtyHint');
  const slider = document.getElementById('qtySlider');
  const qtyInput = document.getElementById('qtyInput');
  if (svc) {
    hint.textContent = `Min: ${svc.minQty.toLocaleString()} / Max: ${svc.maxQty.toLocaleString()}`;
    slider.min = svc.minQty; slider.max = svc.maxQty;
    qtyInput.min = svc.minQty; qtyInput.max = svc.maxQty;
    if (parseInt(qtyInput.value) < svc.minQty) qtyInput.value = svc.minQty;
    slider.value = qtyInput.value;
  } else {
    hint.textContent = 'Min: — / Max: —';
  }
  validateStep2();
  updateOrderSummary();
}

function syncSlider() {
  const v = parseInt(document.getElementById('qtyInput').value) || 0;
  document.getElementById('qtySlider').value = v;
  validateStep2();
}
function syncQty() {
  document.getElementById('qtyInput').value = document.getElementById('qtySlider').value;
  validateStep2();
}

const MIN_GHS = 10.00; // Korapay minimum payment in GHS

function validateStep2() {
  const svcId  = document.getElementById('serviceSelect').value;
  const link   = document.getElementById('linkInput').value.trim();
  const email  = document.getElementById('emailInput').value.trim();
  const qty    = parseInt(document.getElementById('qtyInput').value) || 0;
  const svc    = CONFIG_DATA.services.find(s => s.id === svcId);
  const warning = document.getElementById('minAmountWarning');
  const warnTotal = document.getElementById('warnTotal');

  // Basic field checks
  const fieldsOk = !!(svcId && link && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && svc && qty >= svc.minQty && qty <= svc.maxQty);

  // GHS minimum check
  let totalGHS  = 0;
  let aboveMin  = false;
  if (svc && qty > 0) {
    totalGHS = (svc.pricePerK / 1000) * qty;
    aboveMin = totalGHS >= MIN_GHS;
  }

  // Show or hide the minimum warning
  if (fieldsOk && !aboveMin && svc) {
    warnTotal.textContent = 'GHS ' + totalGHS.toFixed(2);
    warning.style.display = 'block';
  } else {
    warning.style.display = 'none';
  }

  // Button only enabled when ALL conditions pass
  document.getElementById('btnStep2Next').disabled = !(fieldsOk && aboveMin);
}

function updateOrderSummary() {
  const id  = document.getElementById('serviceSelect').value;
  const svc = CONFIG_DATA.services.find(s => s.id === id);
  const qty = parseInt(document.getElementById('qtyInput').value) || 0;
  const ps  = document.getElementById('priceSummary');
  if (!svc || !qty) { ps.style.display = 'none'; validateStep2(); return; }

  const total = (svc.pricePerK / 1000) * qty;
  const belowMin = total < MIN_GHS;

  document.getElementById('psPerK').textContent  = `GHS ${svc.pricePerK.toFixed(2)}`;
  document.getElementById('psQty').textContent   = qty.toLocaleString();
  document.getElementById('psTotal').textContent = `GHS ${total.toFixed(2)}`;

  // Colour total red when below minimum, cyan when OK
  const totalEl = document.getElementById('psTotal');
  totalEl.style.color = belowMin ? '#ef4444' : 'var(--accent-cyan)';

  ps.style.display = 'block';
  validateStep2();
}

function goStep(n) {
  if (n === 3) {
    const id    = document.getElementById('serviceSelect').value;
    const svc   = CONFIG_DATA.services.find(s => s.id === id);
    const qty   = parseInt(document.getElementById('qtyInput').value);
    const link  = document.getElementById('linkInput').value.trim();
    const email = document.getElementById('emailInput').value.trim();

    if (!svc || !qty || !link || !email) {
      toast('Please fill in all fields before reviewing your order.', 'error');
      return;
    }

    const total = (svc.pricePerK / 1000) * qty;

    // Hard block if below Korapay minimum
    if (total < MIN_GHS) {
      toast(`Minimum payment is GHS ${MIN_GHS.toFixed(2)}. Current total is GHS ${total.toFixed(2)}. Please increase your quantity.`, 'error');
      return;
    }

    // Build the order summary card — escape all user-provided values (esc() defined at top of file)
    const tier = id.includes('-premium')
      ? '<span class="tier-badge tier-premium" style="margin-left:8px">⭐ Premium</span>'
      : id.includes('-cheap')
        ? '<span class="tier-badge tier-cheap" style="margin-left:8px">🔥 Cheapest</span>'
        : '';

    document.getElementById('orderSummaryCard').innerHTML = `
      <div class="summary-row"><span>Service</span><span>${esc(svc.name)}${tier}</span></div>
      <div class="summary-row"><span>Platform</span><span>${esc(PLATFORMS[svc.platform]?.label || svc.platform)}</span></div>
      <div class="summary-row"><span>Quantity</span><span>${qty.toLocaleString()}</span></div>
      <div class="summary-row"><span>Link</span><span style="word-break:break-all;max-width:220px;text-align:right">${esc(link)}</span></div>
      <div class="summary-row"><span>Email</span><span>${esc(email)}</span></div>
      <div class="summary-row"><span>Est. Delivery</span><span>1-8 hours</span></div>
      <div class="summary-row"><span>Total</span><span style="color:var(--accent-cyan);font-weight:800">GHS ${total.toFixed(2)}</span></div>`;
  }

  document.querySelectorAll('.order-step').forEach(s => s.classList.remove('active'));
  document.getElementById('ostep' + n).classList.add('active');
  currentStep = n;

  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById('sdot' + i);
    dot.classList.toggle('active', i === n);
    dot.classList.toggle('done', i < n);
  }
  for (let i = 1; i <= 2; i++) {
    document.getElementById('sline' + i).classList.toggle('done', i < n);
  }

  // Scroll to top of form
  document.querySelector('.order-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function prefillOrder(serviceId) {
  showPage('order');
  const svc = CONFIG_DATA.services.find(s => s.id === serviceId);
  if (!svc) return;
  // First select the platform (populates step 1 grid and step 2 dropdown)
  selectPlatform(svc.platform);
  // Then navigate to step 2 and set the service — small delay lets DOM update
  setTimeout(() => {
    goStep(2);
    const sel = document.getElementById('serviceSelect');
    if (sel) {
      sel.value = serviceId;
      onServiceChange();
      updateOrderSummary();
    }
  }, 80);
}

// ─── KORAPAY LAUNCH ────────────────────────────────────────────────────────
async function launchPayment() {
  const serviceId = document.getElementById('serviceSelect').value;
  const link      = document.getElementById('linkInput').value.trim();
  const quantity  = parseInt(document.getElementById('qtyInput').value);
  const email     = document.getElementById('emailInput').value.trim();

  if (!serviceId) return toast('Please select a service.', 'error');
  if (!link)      return toast('Please enter your profile or post link.', 'error');
  if (!email)     return toast('Please enter your email address.', 'error');

  // Final GHS minimum guard before hitting the server
  const svc = CONFIG_DATA.services.find(s => s.id === serviceId);
  if (svc) {
    const total = (svc.pricePerK / 1000) * quantity;
    if (total < MIN_GHS) {
      toast(`Minimum payment is GHS ${MIN_GHS.toFixed(2)}. Please increase your quantity.`, 'error');
      return;
    }
  }

  const btn = document.getElementById('payBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Initializing payment…';

  try {
    const recaptchaToken = await getRecaptchaToken('payment');
    const res = await fetch('/api/payment/initialize', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ serviceId, link, quantity, email, recaptchaToken }),
    });
    const data = await res.json();
    if (data.success && data.paymentUrl) {
      window.location.href = data.paymentUrl;
    } else {
      toast(data.error || 'Payment initialization failed. Please try again.', 'error');
      btn.disabled = false;
      btn.innerHTML = '🔒 Pay with Korapay';
    }
  } catch (err) {
    toast('Network error. Please check your connection and try again.', 'error');
    btn.disabled = false;
    btn.innerHTML = '🔒 Pay with Korapay';
  }
}

// ─── CONTACT FORM ─────────────────────────────────────────────────────────
async function submitContact() {
  const name    = document.getElementById('cName').value.trim();
  const email   = document.getElementById('cEmail').value.trim();
  const message = document.getElementById('cMessage').value.trim();
  const alertEl = document.getElementById('contactAlert');
  const btn     = document.getElementById('contactBtn');

  alertEl.style.display = 'none';
  if (!name)              return showContactAlert('Please enter your name.', 'error');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showContactAlert('Please enter a valid email address.', 'error');
  if (message.length < 10) return showContactAlert('Message must be at least 10 characters.', 'error');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Sending…';

  try {
    const recaptchaToken = await getRecaptchaToken('contact');
    const res  = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message, recaptchaToken }),
    });
    const data = await res.json();
    if (data.success) {
      showContactAlert(data.message || 'Message sent successfully!', 'success');
      document.getElementById('cName').value = '';
      document.getElementById('cEmail').value = '';
      document.getElementById('cMessage').value = '';
    } else {
      showContactAlert(data.error || 'Failed to send message.', 'error');
    }
  } catch (err) {
    showContactAlert('Network error. Please try emailing us directly.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Send Message';
  }
}

function showContactAlert(msg, type) {
  const el = document.getElementById('contactAlert');
  el.className = `alert alert-${type === 'error' ? 'error' : 'success'}`;
  el.textContent = msg;
  el.style.display = 'block';
}

// ─── FAQ RENDER ────────────────────────────────────────────────────────────
function renderFAQ() {
  const list = document.getElementById('faqList');
  list.innerHTML = FAQS.map(([q, a], i) => `
    <div class="faq-item" id="faq-${i}">
      <button class="faq-q" data-faq="${i}">
        <span>${q}</span><span class="faq-icon">+</span>
      </button>
      <div class="faq-a"><p>${a}</p></div>
    </div>`).join('');

  // Wire FAQ toggle clicks via event listeners
  list.querySelectorAll('[data-faq]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = btn.dataset.faq;
      document.getElementById('faq-' + i).classList.toggle('open');
    });
  });
}

function toggleFaq(i) {
  const el = document.getElementById('faq-' + i);
  if (el) el.classList.toggle('open');
}

// ─── URL HANDLING ──────────────────────────────────────────────────────────
function handleURL() {
  const params = new URLSearchParams(window.location.search);
  const hash   = window.location.hash.replace('#','');

  if (params.get('payment') === 'success') {
    toast('Payment successful! Check your email for confirmation.', 'success');
  } else if (params.get('payment') === 'failed') {
    toast('Payment was not completed. Please try again.', 'error');
  }

  const pageMap = { home:'home', services:'services', order:'order', pricing:'pricing', faq:'faq', contact:'contact' };
  if (pageMap[hash]) showPage(pageMap[hash]);
}

// ─── INIT ──────────────────────────────────────────────────────────────────
(async () => {
  // Wire all event listeners first — before any async work
  initEventListeners();
  renderFAQ();
  await loadConfig();
  renderHeroPlatforms();
  renderServices();
  renderPricing();
  buildPlatformSelectGrid();
  loadPublicStats();
  handleURL();
})();