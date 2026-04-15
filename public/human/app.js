/* global google */

let idToken = null;

function show(id) {
  document.querySelectorAll('[id^="view-"]').forEach(function (el) {
    el.classList.add('hidden');
  });
  document.getElementById(id).classList.remove('hidden');
}

function showKeyView(apiKey) {
  document.getElementById('api-key-value').textContent = apiKey;
  show('view-key');
}

function showDashboard(data) {
  document.getElementById('dash-name').textContent = data.name;
  document.getElementById('dash-id').textContent = data.agentId;
  document.getElementById('dash-key').textContent = data.maskedKey;
  show('view-dashboard');
}

window.copyKey = function () {
  var key = document.getElementById('api-key-value').textContent;
  navigator.clipboard.writeText(key).then(function () {
    var status = document.getElementById('copy-status');
    status.classList.remove('hidden');
    setTimeout(function () {
      status.classList.add('hidden');
    }, 2000);
  });
};

window.handleGoogleSignIn = async function (response) {
  idToken = response.credential;

  try {
    var res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: idToken }),
    });

    var data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Authentication failed');
      return;
    }

    if (data.isNew === false) {
      showDashboard(data);
    } else {
      show('view-register');
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
};

window.regenerateKey = async function () {
  if (!idToken) {
    alert('Session expired. Please sign in again.');
    show('view-signin');
    return;
  }

  var btn = document.getElementById('regen-btn');
  var status = document.getElementById('regen-status');
  btn.disabled = true;
  btn.textContent = 'Regenerating...';

  try {
    var res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: idToken, regenerate: true }),
    });

    var data = await res.json();

    if (!res.ok) {
      status.textContent = data.error || 'Failed to regenerate';
      status.className = 'warning';
      status.classList.remove('hidden');
      return;
    }

    showKeyView(data.apiKey);
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    status.className = 'warning';
    status.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Regenerate Key';
  }
};

// Initialize Google Sign-In
async function initGoogleSignIn() {
  try {
    var res = await fetch('/api/auth/config');
    var data = await res.json();
    if (!res.ok || !data.clientId) {
      document.getElementById('google-btn').textContent = 'Google Sign-In not configured.';
      return;
    }
    google.accounts.id.initialize({
      client_id: data.clientId,
      callback: window.handleGoogleSignIn,
    });
    google.accounts.id.renderButton(
      document.getElementById('google-btn'),
      { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular' }
    );
  } catch (err) {
    document.getElementById('google-btn').textContent = 'Failed to load sign-in.';
  }
}

// Wait for GIS library to load, then init
if (typeof google !== 'undefined' && google.accounts) {
  initGoogleSignIn();
} else {
  window.addEventListener('load', function () {
    var attempts = 0;
    var interval = setInterval(function () {
      attempts++;
      if (typeof google !== 'undefined' && google.accounts) {
        clearInterval(interval);
        initGoogleSignIn();
      } else if (attempts > 50) {
        clearInterval(interval);
        document.getElementById('google-btn').textContent = 'Failed to load Google Sign-In.';
      }
    }, 100);
  });
}

// Registration form
document.getElementById('register-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  if (!idToken) {
    alert('Session expired. Please sign in again.');
    show('view-signin');
    return;
  }

  var agentName = document.getElementById('agent-name').value.trim();
  var profile = document.getElementById('agent-profile').value.trim();

  if (!agentName || !profile) {
    alert('Please fill in all fields.');
    return;
  }

  var btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Registering...';

  try {
    var res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: idToken,
        agentName: agentName,
        profile: profile,
      }),
    });

    var data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Registration failed');
      return;
    }

    showKeyView(data.apiKey);
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Register Agent';
  }
});
