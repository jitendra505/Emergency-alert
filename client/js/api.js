/* ===================================================================
   API Layer — Centralized fetch wrapper for all backend calls
   =================================================================== */

const API_BASE = window.location.origin + '/api';

// ---- Helpers ----

function getToken() {
  return localStorage.getItem('token');
}

function getHeaders(isJSON = true) {
  const headers = {};
  if (isJSON) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

function saveAuth(data) {
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
}

function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function isLoggedIn() {
  return !!getToken();
}

// Generic fetch wrapper with error handling
async function apiFetch(endpoint, options = {}) {
  try {
    const res = await fetch(API_BASE + endpoint, options);
    const data = await res.json();

    if (!res.ok) {
      // If unauthorized, redirect to login
      if (res.status === 401) {
        clearAuth();
        window.location.href = '/';
        return;
      }
      throw new Error(data.message || data.errors?.[0]?.msg || 'Something went wrong');
    }

    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Network error — check your connection');
    }
    throw err;
  }
}

// ---- Auth API ----

async function apiRegister(name, email, password, phone = '') {
  return apiFetch('/auth/register', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name, email, password, phone })
  });
}

async function apiLogin(email, password) {
  return apiFetch('/auth/login', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ email, password })
  });
}

async function apiGetMe() {
  return apiFetch('/auth/me', {
    headers: getHeaders()
  });
}

async function apiUpdateProfile(data) {
  return apiFetch('/auth/profile', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
}

// ---- Reports API ----

async function apiSubmitReport(formData) {
  // formData is a FormData object (for file upload)
  return apiFetch('/reports', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${getToken()}` },
    body: formData
  });
}

async function apiGetMyReports(page = 1, limit = 20) {
  return apiFetch(`/reports/my?page=${page}&limit=${limit}`, {
    headers: getHeaders()
  });
}

async function apiGetAllReports(params = {}) {
  const query = new URLSearchParams(params).toString();
  return apiFetch(`/reports?${query}`, {
    headers: getHeaders()
  });
}

async function apiGetReport(id) {
  return apiFetch(`/reports/${id}`, {
    headers: getHeaders()
  });
}

async function apiUpdateReportStatus(id, status, adminNotes = '') {
  return apiFetch(`/reports/${id}/status`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ status, adminNotes })
  });
}

async function apiDeleteReport(id) {
  return apiFetch(`/reports/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
}

// ---- Toast Notification System ----

function showToast(type, title, message, duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);

  // Auto remove
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ---- Utility: Format date ----

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;

  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ---- Utility: Emergency type info ----

function getTypeInfo(type) {
  const types = {
    accident: { icon: '🚗', label: 'Accident', color: '#f97316' },
    fire: { icon: '🔥', label: 'Fire', color: '#ef4444' },
    crime: { icon: '🚔', label: 'Crime', color: '#8b5cf6' },
    medical: { icon: '🏥', label: 'Medical', color: '#ec4899' },
    natural_disaster: { icon: '🌊', label: 'Natural Disaster', color: '#06b6d4' },
    other: { icon: '📌', label: 'Other', color: '#6b7280' }
  };
  return types[type] || types.other;
}

function getSeverityInfo(severity) {
  const severities = {
    low: { icon: '🟢', label: 'Low', color: '#10b981' },
    medium: { icon: '🟡', label: 'Medium', color: '#f59e0b' },
    high: { icon: '🟠', label: 'High', color: '#f97316' },
    critical: { icon: '🔴', label: 'Critical', color: '#ef4444' }
  };
  return severities[severity] || severities.medium;
}
