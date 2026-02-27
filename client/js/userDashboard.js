/* ===================================================================
   User Dashboard — Report form, image upload, map, report tracking
   =================================================================== */

(function () {
  // ---- Auth guard ----
  if (!isLoggedIn()) {
    window.location.href = '/';
    return;
  }
  const user = getUser();
  if (user.role === 'admin') {
    window.location.href = '/admin-dashboard.html';
    return;
  }

  // Set user info in navbar
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userAvatar').textContent = user.name.charAt(0).toUpperCase();

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', () => {
    clearAuth();
    disconnectSocket();
    window.location.href = '/';
  });

  // ---- Tabs ----
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-newReport').classList.toggle('hidden', btn.dataset.tab !== 'newReport');
      document.getElementById('tab-myReports').classList.toggle('hidden', btn.dataset.tab !== 'myReports');
      document.getElementById('tab-profile').classList.toggle('hidden', btn.dataset.tab !== 'profile');
      if (btn.dataset.tab === 'myReports') loadMyReports();
      if (btn.dataset.tab === 'profile') loadProfile();
    });
  });

  // ---- Profile ----
  function loadProfile() {
    const u = getUser();
    document.getElementById('profileAvatar').textContent = u.name.charAt(0).toUpperCase();
    document.getElementById('profileDisplayName').textContent = u.name;
    document.getElementById('profileDisplayEmail').textContent = u.email;
    document.getElementById('profileName').value = u.name;
    document.getElementById('profilePhone').value = u.phone || '';
  }

  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveProfileBtn');
    const name = document.getElementById('profileName').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    const currentPassword = document.getElementById('profileCurrentPass').value;
    const newPassword = document.getElementById('profileNewPass').value;
    const confirmPassword = document.getElementById('profileConfirmPass').value;

    if (!name) { showToast('warning', 'Missing field', 'Name is required'); return; }

    // Password change validation
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
      // Update local storage
      const updatedUser = { ...getUser(), name: data.user.name, phone: data.user.phone };
      localStorage.setItem('user', JSON.stringify(updatedUser));

      // Update navbar
      document.getElementById('userName').textContent = data.user.name;
      document.getElementById('userAvatar').textContent = data.user.name.charAt(0).toUpperCase();
      document.getElementById('profileAvatar').textContent = data.user.name.charAt(0).toUpperCase();
      document.getElementById('profileDisplayName').textContent = data.user.name;

      // Clear password fields
      document.getElementById('profileCurrentPass').value = '';
      document.getElementById('profileNewPass').value = '';
      document.getElementById('profileConfirmPass').value = '';

      showToast('success', 'Profile updated', 'Your changes have been saved');
    } catch (err) {
      showToast('error', 'Update failed', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Save Changes';
    }
  });

  // ---- Map Setup (Leaflet) ----
  let map, marker;
  const defaultCenter = [20.5937, 78.9629]; // India center

  function initMap() {
    map = L.map('map').setView(defaultCenter, 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    marker = L.marker(defaultCenter, { draggable: true }).addTo(map);
    marker.on('dragend', function () {
      const pos = marker.getLatLng();
      document.getElementById('reportLat').value = pos.lat;
      document.getElementById('reportLng').value = pos.lng;
      reverseGeocode(pos.lat, pos.lng);
    });

    map.on('click', function (e) {
      marker.setLatLng(e.latlng);
      document.getElementById('reportLat').value = e.latlng.lat;
      document.getElementById('reportLng').value = e.latlng.lng;
      reverseGeocode(e.latlng.lat, e.latlng.lng);
    });
  }

  // Reverse geocode using Nominatim
  async function reverseGeocode(lat, lng) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      if (data.display_name) {
        document.getElementById('reportAddress').value = data.display_name;
      }
    } catch (err) {
      console.warn('Reverse geocode failed:', err);
    }
  }

  // Locate Me button
  document.getElementById('locateMeBtn').addEventListener('click', () => {
    if (!navigator.geolocation) {
      showToast('warning', 'Not supported', 'Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 16);
        marker.setLatLng([latitude, longitude]);
        document.getElementById('reportLat').value = latitude;
        document.getElementById('reportLng').value = longitude;
        reverseGeocode(latitude, longitude);
        showToast('success', 'Located!', 'Your position has been set on the map');
      },
      (err) => {
        showToast('error', 'Location error', err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // ---- Image Upload ----
  let selectedFiles = [];
  const uploadZone = document.getElementById('uploadZone');
  const imageInput = document.getElementById('imageInput');
  const previewGrid = document.getElementById('imagePreviewGrid');

  uploadZone.addEventListener('click', () => imageInput.click());

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragging');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragging');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragging');
    handleFiles(e.dataTransfer.files);
  });

  imageInput.addEventListener('change', () => {
    handleFiles(imageInput.files);
  });

  function handleFiles(fileList) {
    const files = Array.from(fileList);
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    for (const file of files) {
      if (selectedFiles.length >= 4) {
        showToast('warning', 'Limit reached', 'Maximum 4 images allowed');
        break;
      }
      if (!allowed.includes(file.type)) {
        showToast('warning', 'Invalid file', `${file.name} is not a supported image format`);
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast('warning', 'File too large', `${file.name} exceeds 5MB limit`);
        continue;
      }
      selectedFiles.push(file);
    }
    renderPreviews();
  }

  function renderPreviews() {
    previewGrid.innerHTML = '';
    selectedFiles.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const div = document.createElement('div');
        div.className = 'image-preview-item';
        div.innerHTML = `
          <img src="${e.target.result}" alt="Preview">
          <button class="remove-btn" data-idx="${idx}">✕</button>
        `;
        div.querySelector('.remove-btn').addEventListener('click', () => {
          selectedFiles.splice(idx, 1);
          renderPreviews();
        });
        previewGrid.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
  }

  // ---- Submit Report ----
  document.getElementById('reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitReportBtn');
    const type = document.getElementById('reportType').value;
    const severity = document.getElementById('reportSeverity').value;
    const title = document.getElementById('reportTitle').value.trim();
    const description = document.getElementById('reportDescription').value.trim();
    const address = document.getElementById('reportAddress').value.trim();
    const lat = document.getElementById('reportLat').value;
    const lng = document.getElementById('reportLng').value;

    if (!type || !title || !description || !address) {
      showToast('warning', 'Missing fields', 'Please fill in all required fields');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Submitting...';

    try {
      const formData = new FormData();
      formData.append('type', type);
      formData.append('severity', severity);
      formData.append('title', title);
      formData.append('description', description);
      formData.append('address', address);
      if (lat) formData.append('lat', lat);
      if (lng) formData.append('lng', lng);
      selectedFiles.forEach(f => formData.append('images', f));

      const data = await apiSubmitReport(formData);
      showToast('success', 'Report submitted!', 'Emergency services have been notified');

      // Reset form
      document.getElementById('reportForm').reset();
      selectedFiles = [];
      renderPreviews();
      document.getElementById('reportLat').value = '';
      document.getElementById('reportLng').value = '';
      marker.setLatLng(defaultCenter);
      map.setView(defaultCenter, 5);

    } catch (err) {
      showToast('error', 'Submission failed', err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '🚨 Submit Emergency Report';
    }
  });

  // ---- Load My Reports ----
  async function loadMyReports() {
    const container = document.getElementById('myReportsList');
    container.innerHTML = '<div class="flex justify-center" style="padding: 40px;"><div class="spinner"></div></div>';

    try {
      const data = await apiGetMyReports();
      if (!data.reports || data.reports.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <h3>No reports yet</h3>
            <p>Submit an emergency report to see it here.</p>
          </div>`;
        return;
      }
      container.innerHTML = '';
      data.reports.forEach(report => {
        container.appendChild(createReportCard(report));
      });
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error loading reports</h3><p>${err.message}</p></div>`;
    }
  }

  function createReportCard(report) {
    const typeInfo = getTypeInfo(report.type);
    const sevInfo = getSeverityInfo(report.severity);
    const div = document.createElement('div');
    div.className = `report-card severity-${report.severity}`;
    div.dataset.id = report._id;

    let imagesHTML = '';
    if (report.images && report.images.length > 0) {
      imagesHTML = `<div class="report-images">
        ${report.images.map(img => `<img src="${img}" alt="Evidence" onclick="openLightbox('${img}')">`).join('')}
      </div>`;
    }

    div.innerHTML = `
      <div class="report-header">
        <div>
          <div class="report-title">${typeInfo.icon} ${report.title}</div>
          <div class="report-meta">
            <span class="badge badge-type">${typeInfo.label}</span>
            <span class="badge badge-severity-${report.severity}">${sevInfo.icon} ${sevInfo.label}</span>
            <span class="badge badge-status-${report.status}">${report.status}</span>
          </div>
        </div>
      </div>
      <div class="report-description">${report.description}</div>
      ${imagesHTML}
      <div class="report-footer">
        <span class="text-muted" style="font-size: 0.82rem;">📍 ${report.location?.address || 'N/A'}</span>
        <span class="text-muted" style="font-size: 0.82rem;">🕐 ${formatDate(report.createdAt)}</span>
      </div>
      ${report.adminNotes ? `<div style="margin-top: 10px; padding: 10px; background: rgba(14,165,233,0.05); border-radius: 8px; font-size: 0.85rem;"><strong>Admin Notes:</strong> ${report.adminNotes}</div>` : ''}
    `;

    return div;
  }

  // ---- Real-Time: Status Updates ----
  const sock = initSocket();
  if (sock) {
    sock.on('statusUpdate', (data) => {
      showToast('info', 'Status Updated', `Report status changed to: ${data.status}`);
      // Refresh report list if on that tab
      const myReportsTab = document.querySelector('[data-tab="myReports"]');
      if (myReportsTab.classList.contains('active')) {
        loadMyReports();
      }
    });
  }

  // ---- Lightbox ----
  window.openLightbox = function (src) {
    const lightbox = document.getElementById('lightbox');
    document.getElementById('lightboxImg').src = src;
    lightbox.classList.remove('hidden');
  };

  document.getElementById('lightbox').addEventListener('click', () => {
    document.getElementById('lightbox').classList.add('hidden');
  });

  // ---- Report Detail Modal ----
  document.getElementById('closeReportDetail').addEventListener('click', () => {
    document.getElementById('reportDetailModal').classList.add('hidden');
  });

  // ---- Init ----
  initMap();

})();
