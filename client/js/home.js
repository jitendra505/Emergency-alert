/* ===================================================================
   Home / Landing Page — Real-time stats + Auth modal
   =================================================================== */

(function () {
  // If already logged in, redirect to dashboard
  if (isLoggedIn()) {
    const user = getUser();
    if (user && user.role === 'admin') {
      window.location.href = '/admin-dashboard.html';
    } else {
      window.location.href = '/user-dashboard.html';
    }
    return;
  }

  // ---- Load Public Stats (real data from DB) ----
  async function loadPublicStats() {
    try {
      const res = await fetch(API_BASE + '/stats/public');
      const data = await res.json();
      if (!data.success) return;

      const s = data.stats;

      // Main counters
      animateNumber('homeStatTotal', s.totalReports);
      animateNumber('homeStatPending', s.statuses.Pending);
      animateNumber('homeStatProgress', s.statuses['In Progress']);
      animateNumber('homeStatResolved', s.statuses.Resolved);
      animateNumber('homeStatUsers', s.totalUsers);
      document.getElementById('homeStatAvgTime').textContent = s.avgResolutionHours || '—';

      // Severity bar
      const total = s.totalReports || 1;
      const sev = s.severities;
      document.getElementById('sevLow').textContent = sev.low || 0;
      document.getElementById('sevMedium').textContent = sev.medium || 0;
      document.getElementById('sevHigh').textContent = sev.high || 0;
      document.getElementById('sevCritical').textContent = sev.critical || 0;

      const bar = document.getElementById('severityBar');
      bar.innerHTML = `
        <div style="width: ${((sev.low || 0) / total * 100)}%; background: var(--severity-low);" title="Low: ${sev.low || 0}"></div>
        <div style="width: ${((sev.medium || 0) / total * 100)}%; background: var(--severity-medium);" title="Medium: ${sev.medium || 0}"></div>
        <div style="width: ${((sev.high || 0) / total * 100)}%; background: var(--severity-high);" title="High: ${sev.high || 0}"></div>
        <div style="width: ${((sev.critical || 0) / total * 100)}%; background: var(--severity-critical);" title="Critical: ${sev.critical || 0}"></div>
      `;

      // Type breakdown
      const typeContainer = document.getElementById('typeBreakdown');
      const typeConfig = {
        accident: { icon: '🚗', label: 'Accident', bg: 'rgba(249,115,22,0.12)' },
        fire: { icon: '🔥', label: 'Fire', bg: 'rgba(239,68,68,0.12)' },
        crime: { icon: '🚔', label: 'Crime', bg: 'rgba(139,92,246,0.12)' },
        medical: { icon: '🏥', label: 'Medical', bg: 'rgba(236,72,153,0.12)' },
        natural_disaster: { icon: '🌊', label: 'Natural Disaster', bg: 'rgba(6,182,212,0.12)' },
        other: { icon: '📌', label: 'Other', bg: 'rgba(107,114,128,0.12)' }
      };

      const allTypes = ['accident', 'fire', 'crime', 'medical', 'natural_disaster', 'other'];
      typeContainer.innerHTML = allTypes.map(type => {
        const conf = typeConfig[type];
        const count = s.types[type] || 0;
        return `
          <div class="type-card">
            <div class="type-icon" style="background: ${conf.bg};">${conf.icon}</div>
            <div>
              <div class="type-count">${count}</div>
              <div class="type-label">${conf.label}</div>
            </div>
          </div>
        `;
      }).join('');

      // Recently resolved
      const recentContainer = document.getElementById('recentResolved');
      if (s.recentResolved && s.recentResolved.length > 0) {
        recentContainer.innerHTML = `
          <table class="recent-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Location</th>
                <th>Severity</th>
                <th>Resolved</th>
              </tr>
            </thead>
            <tbody>
              ${s.recentResolved.map(r => {
                const tc = typeConfig[r.type] || typeConfig.other;
                const sevColors = { low: 'var(--severity-low)', medium: 'var(--severity-medium)', high: 'var(--severity-high)', critical: 'var(--severity-critical)' };
                return `
                  <tr>
                    <td>${tc.icon} ${tc.label}</td>
                    <td><strong>${r.title}</strong></td>
                    <td style="color: var(--text-secondary);">${r.location?.address || 'N/A'}</td>
                    <td><span class="badge badge-severity-${r.severity}" style="text-transform: capitalize;">${r.severity}</span></td>
                    <td style="color: var(--text-muted); font-size: 0.82rem;">${formatDate(r.resolvedAt || r.createdAt)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
      } else {
        recentContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <h3>No resolved incidents yet</h3>
            <p>Resolved emergency reports will appear here.</p>
          </div>
        `;
      }

    } catch (err) {
      console.error('Failed to load public stats:', err);
      document.getElementById('homeStatTotal').textContent = '—';
    }
  }

  // Animate number counting up
  function animateNumber(id, target) {
    const el = document.getElementById(id);
    if (!el || target === 0) { el.textContent = '0'; return; }
    const duration = 800;
    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ---- Auth Modal ----
  window.openAuthModal = function (mode) {
    document.getElementById('authModal').classList.remove('hidden');
    if (mode === 'register') {
      document.getElementById('loginSection').classList.add('hidden');
      document.getElementById('registerSection').classList.remove('hidden');
    } else {
      document.getElementById('registerSection').classList.add('hidden');
      document.getElementById('loginSection').classList.remove('hidden');
    }
  };

  window.closeAuthModal = function () {
    document.getElementById('authModal').classList.add('hidden');
  };

  // Close modal on overlay click
  document.getElementById('authModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAuthModal();
  });

  // Toggle login/register
  document.getElementById('showRegister').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('registerSection').classList.remove('hidden');
  });

  document.getElementById('showLogin').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('registerSection').classList.add('hidden');
    document.getElementById('loginSection').classList.remove('hidden');
  });

  // Login handler
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) { showToast('warning', 'Missing fields', 'Please fill in all fields'); return; }
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      const data = await apiLogin(email, password);
      saveAuth(data);
      showToast('success', 'Welcome back!', `Hello, ${data.user.name}`);
      setTimeout(() => {
        window.location.href = data.user.role === 'admin' ? '/admin-dashboard.html' : '/user-dashboard.html';
      }, 500);
    } catch (err) {
      showToast('error', 'Login failed', err.message);
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });

  // Register handler
  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('registerBtn');
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirm').value;

    if (!name || !email || !password) { showToast('warning', 'Missing fields', 'Please fill in all required fields'); return; }
    if (password.length < 6) { showToast('warning', 'Weak password', 'Password must be at least 6 characters'); return; }
    if (password !== confirm) { showToast('error', 'Mismatch', 'Passwords do not match'); return; }

    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
      const data = await apiRegister(name, email, password, phone);
      saveAuth(data);
      showToast('success', 'Account created!', `Welcome, ${data.user.name}`);
      setTimeout(() => { window.location.href = '/user-dashboard.html'; }, 500);
    } catch (err) {
      showToast('error', 'Registration failed', err.message);
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  });

  // ---- Init ----
  loadPublicStats();

  // Refresh stats every 30 seconds
  setInterval(loadPublicStats, 30000);
})();
