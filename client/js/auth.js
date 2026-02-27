/* ===================================================================
   Auth Page Logic — Login / Register toggle and form submission
   =================================================================== */

(function () {
  // If already logged in, redirect
  if (isLoggedIn()) {
    const user = getUser();
    if (user && user.role === 'admin') {
      window.location.href = '/admin-dashboard.html';
    } else {
      window.location.href = '/user-dashboard.html';
    }
    return;
  }

  // DOM elements
  const loginSection = document.getElementById('loginSection');
  const registerSection = document.getElementById('registerSection');
  const showRegisterBtn = document.getElementById('showRegister');
  const showLoginBtn = document.getElementById('showLogin');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  // Toggle forms
  showRegisterBtn.addEventListener('click', (e) => {
    e.preventDefault();
    loginSection.classList.add('hidden');
    registerSection.classList.remove('hidden');
  });

  showLoginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    registerSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
  });

  // Login handler
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
      showToast('warning', 'Missing fields', 'Please fill in all fields');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      const data = await apiLogin(email, password);
      saveAuth(data);
      showToast('success', 'Welcome back!', `Hello, ${data.user.name}`);

      setTimeout(() => {
        if (data.user.role === 'admin') {
          window.location.href = '/admin-dashboard.html';
        } else {
          window.location.href = '/user-dashboard.html';
        }
      }, 500);
    } catch (err) {
      showToast('error', 'Login failed', err.message);
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });

  // Register handler
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('registerBtn');
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirm').value;

    if (!name || !email || !password) {
      showToast('warning', 'Missing fields', 'Please fill in all required fields');
      return;
    }

    if (password.length < 6) {
      showToast('warning', 'Weak password', 'Password must be at least 6 characters');
      return;
    }

    if (password !== confirm) {
      showToast('error', 'Password mismatch', 'Passwords do not match');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
      const data = await apiRegister(name, email, password, phone);
      saveAuth(data);
      showToast('success', 'Account created!', `Welcome, ${data.user.name}`);

      setTimeout(() => {
        window.location.href = '/user-dashboard.html';
      }, 500);
    } catch (err) {
      showToast('error', 'Registration failed', err.message);
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  });
})();
