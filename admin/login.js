'use strict';

// If already logged in redirect immediately
fetch('/admin/api/me', { credentials: 'include' })
  .then(r => r.json())
  .then(d => { if (d.success) window.location.href = '/admin/dashboard'; })
  .catch(() => {});

function showAlert(msg, type) {
  const el = document.getElementById('loginAlert');
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.style.display = 'block';
}

async function doLogin() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const btn      = document.getElementById('loginBtn');

  document.getElementById('loginAlert').style.display = 'none';

  if (!username || !password) {
    showAlert('Please enter your username and password.', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in…';

  try {
    const res  = await fetch('/admin/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.success) {
      window.location.href = '/admin/dashboard';
    } else {
      showAlert(data.error || 'Invalid credentials. Please try again.', 'error');
      btn.disabled = false;
      btn.innerHTML = 'Sign In';
    }
  } catch (err) {
    showAlert('Network error. Please try again.', 'error');
    btn.disabled = false;
    btn.innerHTML = 'Sign In';
  }
}

// Wire all event listeners — no inline handlers
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginBtn').addEventListener('click', doLogin);

  document.getElementById('password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });

  document.getElementById('username').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('password').focus();
  });
});
