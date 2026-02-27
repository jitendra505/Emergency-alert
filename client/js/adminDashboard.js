/* ===================================================================
   Admin Dashboard — Live report feed, filters, status management
   =================================================================== */

(function () {
  // ---- Auth guard ----
  if (!isLoggedIn()) {
    window.location.href = '/';
    return;
  }
  const user = getUser();
  if (user.role !== 'admin') {
    window.location.href = '/user-dashboard.html';
    return;
  }

  // Set admin info
  document.getElementById('adminName').textContent = user.name;
  document.getElementById('adminAvatar').textContent = user.name.charAt(0).toUpperCase();

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', () => {
    clearAuth();
    disconnectSocket();
    window.location.href = '/';
  });

  // ---- Profile Toggle ----
  let profileVisible = false;

  document.getElementById('adminProfileToggle').addEventListener('click', () => {
    profileVisible = !profileVisible;
    const profileSection = document.getElementById('adminProfileSection');
    const mainSections = ['statsGrid', 'adminReportsList', 'paginationControls'];

    if (profileVisible) {
      mainSections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      document.querySelector('.filter-bar').style.display = 'none';
      profileSection.classList.remove('hidden');
      loadAdminProfile();
    } else {
      mainSections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
      });
      document.querySelector('.filter-bar').style.display = '';
      profileSection.classList.add('hidden');
    }
  });

  function loadAdminProfile() {
    const u = getUser();
    document.getElementById('profileAvatar').textContent = u.name.charAt(0).toUpperCase();
    document.getElementById('profileDisplayName').textContent = u.name;
    document.getElementById('profileDisplayEmail').textContent = u.email;
    document.getElementById('adminProfileName').value = u.name;
    document.getElementById('adminProfilePhone').value = u.phone || '';
  }

  document.getElementById('adminProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveAdminProfileBtn');
    const name = document.getElementById('adminProfileName').value.trim();
    const phone = document.getElementById('adminProfilePhone').value.trim();
    const currentPassword = document.getElementById('adminCurrentPass').value;
    const newPassword = document.getElementById('adminNewPass').value;
    const confirmPassword = document.getElementById('adminConfirmPass').value;

    if (!name) { showToast('warning', 'Missing field', 'Name is required'); return; }

    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) { showToast('warning', 'Current password required', 'Enter your current password to change it'); return; }
      if (newPassword.length < 6) { showToast('warning', 'Weak password', 'New password must be at least 6 characters'); return; }
      if (newPassword !== confirmPassword) { showToast('error', 'Mismatch', 'New passwords do not match'); return; }
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const payload = { name, phone };
      if (newPassword && currentPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }
      const data = await apiUpdateProfile(payload);
      const updatedUser = { ...getUser(), name: data.user.name, phone: data.user.phone };
      localStorage.setItem('user', JSON.stringify(updatedUser));

      document.getElementById('adminName').textContent = data.user.name;
      document.getElementById('adminAvatar').textContent = data.user.name.charAt(0).toUpperCase();
      document.getElementById('profileAvatar').textContent = data.user.name.charAt(0).toUpperCase();
      document.getElementById('profileDisplayName').textContent = data.user.name;

      document.getElementById('adminCurrentPass').value = '';
      document.getElementById('adminNewPass').value = '';
      document.getElementById('adminConfirmPass').value = '';

      showToast('success', 'Profile updated', 'Your changes have been saved');
    } catch (err) {
      showToast('error', 'Update failed', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Save Changes';
    }
  });

  // ---- State ----
  let currentPage = 1;
  let newAlertCount = 0;

  // ---- Load Reports ----
  async function loadReports(page = 1) {
    const container = document.getElementById('adminReportsList');
    container.innerHTML = '<div class="flex justify-center" style="padding: 40px;"><div class="spinner"></div></div>';

    const params = { page, limit: 20 };
    const status = document.getElementById('filterStatus').value;
    const type = document.getElementById('filterType').value;
    const severity = document.getElementById('filterSeverity').value;
    const search = document.getElementById('searchInput').value.trim();

    if (status) params.status = status;
    if (type) params.type = type;
    if (severity) params.severity = severity;
    if (search) params.search = search;

    try {
      const data = await apiGetAllReports(params);

      // Update stats
      const stats = data.stats || {};
      const total = (stats.Pending || 0) + (stats['In Progress'] || 0) + (stats.Resolved || 0) + (stats.Dismissed || 0);
      document.getElementById('statTotal').textContent = total;
      document.getElementById('statPending').textContent = stats.Pending || 0;
      document.getElementById('statProgress').textContent = stats['In Progress'] || 0;
      document.getElementById('statResolved').textContent = stats.Resolved || 0;

      if (!data.reports || data.reports.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <h3>No reports found</h3>
            <p>Try adjusting your filters or wait for new reports.</p>
          </div>`;
        renderPagination(0, 1);
        return;
      }

      container.innerHTML = '';
      data.reports.forEach(report => {
        container.appendChild(createAdminReportCard(report));
      });

      renderPagination(data.pagination.pages, data.pagination.page);
      currentPage = data.pagination.page;

    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error loading reports</h3><p>${err.message}</p></div>`;
    }
  }

  function createAdminReportCard(report) {
    const typeInfo = getTypeInfo(report.type);
    const sevInfo = getSeverityInfo(report.severity);
    const div = document.createElement('div');
    div.className = `report-card severity-${report.severity}`;
    div.dataset.id = report._id;

    const userName = report.user?.name || 'Unknown';
    const userEmail = report.user?.email || '';
    const userPhone = report.user?.phone || '';

    let imagesHTML = '';
    if (report.images && report.images.length > 0) {
      imagesHTML = `<div class="report-images">
        ${report.images.map(img => `<img src="${img}" alt="Evidence" onclick="event.stopPropagation(); openLightbox('${img}')">`).join('')}
      </div>`;
    }

    div.innerHTML = `
      <div class="report-header">
        <div style="flex: 1;">
          <div class="report-title">${typeInfo.icon} ${report.title}</div>
          <div class="report-meta">
            <span class="badge badge-type">${typeInfo.label}</span>
            <span class="badge badge-severity-${report.severity}">${sevInfo.icon} ${sevInfo.label}</span>
            <span class="badge badge-status-${report.status}">${report.status}</span>
          </div>
        </div>
        <div style="text-align: right; flex-shrink: 0;">
          <select class="status-select" data-id="${report._id}" onchange="handleStatusChange(this)">
            <option value="Pending" ${report.status === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
            <option value="In Progress" ${report.status === 'In Progress' ? 'selected' : ''}>🔄 In Progress</option>
            <option value="Resolved" ${report.status === 'Resolved' ? 'selected' : ''}>✅ Resolved</option>
            <option value="Dismissed" ${report.status === 'Dismissed' ? 'selected' : ''}>🚫 Dismissed</option>
          </select>
        </div>
      </div>
      <div class="report-description">${report.description}</div>
      ${imagesHTML}
      <div class="report-footer">
        <div>
          <span class="text-muted" style="font-size: 0.82rem;">📍 ${report.location?.address || 'N/A'}</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-muted" style="font-size: 0.82rem;">👤 ${userName}</span>
          ${userPhone ? `<span class="text-muted" style="font-size: 0.82rem;">📞 ${userPhone}</span>` : ''}
          <span class="text-muted" style="font-size: 0.82rem;">🕐 ${formatDate(report.createdAt)}</span>
        </div>
      </div>
      <div style="margin-top: 10px;">
        <textarea class="admin-notes" data-id="${report._id}" placeholder="Add admin notes..." rows="2">${report.adminNotes || ''}</textarea>
        <button class="btn btn-sm btn-primary" style="margin-top: 6px;" onclick="saveNotes('${report._id}')">Save Notes</button>
        ${report.location?.lat ? `<button class="btn btn-sm" style="margin-top: 6px; margin-left: 6px;" onclick="viewOnMap(${report.location.lat}, ${report.location.lng}, '${report.title.replace(/'/g, "\\'")}')">🗺️ View Map</button>` : ''}
      </div>
    `;

    return div;
  }

  // ---- Status Change Handler ----
  window.handleStatusChange = async function (selectEl) {
    const reportId = selectEl.dataset.id;
    const newStatus = selectEl.value;
    const notesEl = document.querySelector(`.admin-notes[data-id="${reportId}"]`);
    const adminNotes = notesEl ? notesEl.value : '';

    try {
      await apiUpdateReportStatus(reportId, newStatus, adminNotes);
      showToast('success', 'Status updated', `Report marked as ${newStatus}`);
      // Refresh to update stats
      loadReports(currentPage);
    } catch (err) {
      showToast('error', 'Update failed', err.message);
    }
  };

  // ---- Save Notes Handler ----
  window.saveNotes = async function (reportId) {
    const notesEl = document.querySelector(`.admin-notes[data-id="${reportId}"]`);
    const statusEl = document.querySelector(`.status-select[data-id="${reportId}"]`);
    if (!notesEl || !statusEl) return;

    try {
      await apiUpdateReportStatus(reportId, statusEl.value, notesEl.value);
      showToast('success', 'Notes saved', 'Admin notes have been saved');
    } catch (err) {
      showToast('error', 'Save failed', err.message);
    }
  };

  // ---- View on Map ----
  window.viewOnMap = function (lat, lng, title) {
    const modal = document.getElementById('reportDetailModal');
    const content = document.getElementById('reportDetailContent');
    content.innerHTML = `
      <h3 style="margin-bottom: 12px;">🗺️ ${title}</h3>
      <div id="detailMap" style="width: 100%; height: 400px; border-radius: 12px; overflow: hidden;"></div>
    `;
    modal.classList.remove('hidden');

    setTimeout(() => {
      const detailMap = L.map('detailMap').setView([lat, lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
      }).addTo(detailMap);
      L.marker([lat, lng]).addTo(detailMap).bindPopup(title).openPopup();
    }, 100);
  };

  // ---- Lightbox ----
  window.openLightbox = function (src) {
    const lightbox = document.getElementById('lightbox');
    document.getElementById('lightboxImg').src = src;
    lightbox.classList.remove('hidden');
  };

  document.getElementById('lightbox').addEventListener('click', () => {
    document.getElementById('lightbox').classList.add('hidden');
  });

  // ---- Modal close ----
  document.getElementById('closeReportDetail').addEventListener('click', () => {
    document.getElementById('reportDetailModal').classList.add('hidden');
  });

  document.getElementById('reportDetailModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.add('hidden');
    }
  });

  // ---- Filters ----
  let filterTimeout;
  function debounceLoad() {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => loadReports(1), 300);
  }

  document.getElementById('searchInput').addEventListener('input', debounceLoad);
  document.getElementById('filterStatus').addEventListener('change', () => loadReports(1));
  document.getElementById('filterType').addEventListener('change', () => loadReports(1));
  document.getElementById('filterSeverity').addEventListener('change', () => loadReports(1));

  // ---- Pagination ----
  function renderPagination(totalPages, current) {
    const container = document.getElementById('paginationControls');
    container.innerHTML = '';
    if (totalPages <= 1) return;

    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.className = `btn btn-sm ${i === current ? 'btn-primary' : ''}`;
      btn.textContent = i;
      btn.addEventListener('click', () => loadReports(i));
      container.appendChild(btn);
    }
  }

  // ---- Real-Time: New Reports ----
  const sock = initSocket();
  if (sock) {
    sock.on('newReport', (report) => {
      // Increment badge
      newAlertCount++;
      const badge = document.getElementById('bellBadge');
      badge.textContent = newAlertCount;
      badge.classList.remove('hidden');

      // Play alert sound
      const audio = document.getElementById('alertSound');
      if (audio) {
        audio.play().catch(() => {}); // Autoplay may be blocked
      }

      // Show toast
      const typeInfo = getTypeInfo(report.type);
      showToast('warning', `🚨 New ${typeInfo.label} Report`, report.title, 6000);

      // Reload reports
      loadReports(currentPage);
    });
  }

  // Reset bell on click
  document.getElementById('notifBell').addEventListener('click', () => {
    newAlertCount = 0;
    const badge = document.getElementById('bellBadge');
    badge.textContent = '0';
    badge.classList.add('hidden');
  });

  // ---- Initial Load ----
  loadReports(1);

})();
