// ===== Dandy Engines — Stage 1: scaffold + auth =====
// Later stages plug real tab content into renderTab(); for now each tab
// shows a placeholder so the nav/permissions/theme system can be reviewed
// and tested before the data-heavy screens are built.

const TAB_LABELS = {
  home: '🏠 Home',
  myjobs: '🔧 My Jobs',
  alljobs: '📋 All Jobs',
  rottler: '⚙️ Rottler',
  tunnelvision: '🌀 Tunnel Vision',
  machining: '🛠️ Machining',
  partpayments: '💰 Part Payments',
  settings: '⚙️ Settings',
  history: '🕘 History',
};

let session = null; // { token, userId, name, role, tabs, ... }
let activeTab = 'home';

function saveSession(s) {
  session = s;
  localStorage.setItem('de_session', JSON.stringify(s));
}
function loadSession() {
  try {
    const raw = localStorage.getItem('de_session');
    if (raw) session = JSON.parse(raw);
  } catch {
    session = null;
  }
}
function clearSession() {
  session = null;
  localStorage.removeItem('de_session');
}

// ---------- Login ----------
const loginScreen = document.getElementById('login-screen');
const appEl = document.getElementById('app');
const loginForm = document.getElementById('login-form');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const password = loginPassword.value;
  if (!password) return;

  let res;
  try {
    res = await fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
  } catch {
    loginError.textContent = "Can't reach the server — check your connection.";
    loginError.hidden = false;
    return;
  }

  if (res.status === 401) {
    loginError.textContent = 'Wrong password.';
    loginError.hidden = false;
    return;
  }
  if (!res.ok) {
    loginError.textContent = 'Server error — the auth function may not be deployed correctly (see README).';
    loginError.hidden = false;
    return;
  }

  const data = await res.json();
  saveSession(data);
  showApp();
});

// ---------- App shell ----------
function showApp() {
  loginScreen.hidden = true;
  appEl.hidden = false;
  applyTheme();
  buildNav();
  setActiveTab(session.tabs.includes('home') ? 'home' : session.tabs[0]);
}

function buildNav() {
  const sidebarTabs = document.getElementById('sidebar-tabs');
  const bottomNav = document.getElementById('bottom-nav');
  const sidebarUser = document.getElementById('sidebar-user');

  sidebarTabs.innerHTML = '';
  bottomNav.innerHTML = '';

  session.tabs.filter((t) => t !== 'history').forEach((tabId) => {
    const label = TAB_LABELS[tabId] || tabId;

    const sideBtn = document.createElement('button');
    sideBtn.className = 'tab-btn';
    sideBtn.dataset.tab = tabId;
    sideBtn.textContent = label;
    sideBtn.addEventListener('click', () => setActiveTab(tabId));
    sidebarTabs.appendChild(sideBtn);

    const bottomBtn = document.createElement('button');
    bottomBtn.className = 'tab-btn';
    bottomBtn.dataset.tab = tabId;
    bottomBtn.innerHTML = label;
    bottomBtn.addEventListener('click', () => setActiveTab(tabId));
    bottomNav.appendChild(bottomBtn);
  });

  sidebarUser.textContent = `${session.name} · ${session.role}`;
}

function setActiveTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.getElementById('page-title').textContent = (TAB_LABELS[tabId] || tabId).replace(/^\S+\s/, '');
  renderTab(tabId);
}

// ---------- Tab content ----------
function renderTab(tabId) {
  const content = document.getElementById('content');

  if (tabId === 'settings') {
    content.innerHTML = renderSettings();
    wireSettings();
    alertsSettingsHTML().then((html) => {
      const holder = document.getElementById('alerts-holder');
      if (holder) { holder.innerHTML = html; wireAlertsSettings(); }
    });
    return;
  }
  if (tabId === 'myjobs') {
    renderMyJobsTab();
    return;
  }
  if (tabId === 'alljobs') {
    renderAllJobsTab();
    return;
  }
  if (tabId === 'tunnelvision') {
    renderTunnelVisionTab();
    return;
  }
  if (tabId === 'rottler') {
    renderRottlerTab();
    return;
  }
  if (tabId === 'partpayments') {
    renderPartPaymentsTab();
    return;
  }
  if (tabId === 'history') {
    renderHistoryTab();
    return;
  }
  if (tabId === 'machining') {
    renderMachiningTab();
    return;
  }

  content.innerHTML = `
    <div class="stub-card">
      <h2>${(TAB_LABELS[tabId] || tabId).replace(/^\S+\s/, '')}</h2>
      <p>This screen is scaffolded and permission-gated for <strong>${session.name}</strong>,
      but the real content is built in a later stage. Auth, roles, navigation,
      and theming are all live and testable now.</p>
    </div>
  `;
}

function renderSettings() {
  const theme = localStorage.getItem('de_theme') || 'dark';
  return `
    <div class="stub-card" style="margin-bottom:14px;">
      <h2>Account</h2>
      <p>Logged in as <strong>${session.name}</strong> (${session.role})</p>
      <button id="logout-btn" style="margin-top:10px;padding:8px 14px;border-radius:8px;border:1px solid var(--hairline);background:var(--panel-raised);color:var(--text);">Log out</button>
    </div>
    <div class="stub-card">
      <h2>Theme</h2>
      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;">
        <input type="radio" name="theme" value="dark" ${theme === 'dark' ? 'checked' : ''}> Dark
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <input type="radio" name="theme" value="light" ${theme === 'light' ? 'checked' : ''}> Light
      </label>
    </div>
    <div id="alerts-holder"></div>
    ${session.role === 'admin' ? `
    <div class="stub-card" style="margin-top:14px;">
      <h2>History</h2>
      <p class="muted-sm">Review and revert recent actions across every tab (last 60 days).</p>
      <button id="open-history-btn" style="margin-top:10px;padding:8px 14px;border-radius:8px;border:1px solid var(--hairline);background:var(--panel-raised);color:var(--text);">Open History</button>
    </div>
    <div class="stub-card" style="margin-top:14px;">
      <h2>Import Legacy Spreadsheet Data</h2>
      <p class="muted-sm">One-time import of the historical job data from the original Google Sheet. Safe to click — it won't overwrite any sheet that already has jobs in it, unless you explicitly force it.</p>
      <button id="import-legacy-btn" style="margin-top:10px;padding:8px 14px;border-radius:8px;border:1px solid var(--hairline);background:var(--panel-raised);color:var(--text);">Check Import Status</button>
      <div id="import-legacy-result" class="muted-sm" style="margin-top:10px;"></div>
    </div>` : ''}
  `;
}

function wireSettings() {
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    clearSession();
    location.reload();
  });
  document.querySelectorAll('input[name="theme"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      localStorage.setItem('de_theme', e.target.value);
      applyTheme();
    });
  });
  document.getElementById('open-history-btn')?.addEventListener('click', () => {
    document.getElementById('page-title').textContent = 'History';
    renderHistoryTab();
  });
  document.getElementById('import-legacy-btn')?.addEventListener('click', checkImportStatus);
}

async function checkImportStatus() {
  const result = document.getElementById('import-legacy-result');
  result.textContent = 'Checking…';
  try {
    const { status } = await api('/.netlify/functions/import-legacy');
    const lines = Object.entries(status).map(([sheet, s]) => {
      const existing = s.existingJobs ?? s.existingEntries;
      const toImport = s.importJobs ?? s.importEntries;
      return `${sheet}: ${existing} existing, ${toImport} available to import`;
    });
    result.innerHTML = lines.join('<br>') + `
      <button id="run-import-btn" class="btn-primary" style="margin-top:10px;">Run Import</button>
    `;
    document.getElementById('run-import-btn').addEventListener('click', runImport);
  } catch (e) {
    result.textContent = "Couldn't check: " + e.message;
  }
}

async function runImport() {
  const result = document.getElementById('import-legacy-result');
  result.textContent = 'Importing… this may take a few seconds.';
  try {
    const { results } = await api('/.netlify/functions/import-legacy', {
      method: 'POST', body: JSON.stringify({ action: 'run' }),
    });
    result.innerHTML = Object.entries(results).map(([k, v]) => `${k}: ${v}`).join('<br>');
  } catch (e) {
    result.textContent = "Couldn't import: " + e.message;
  }
}

function applyTheme() {
  const theme = localStorage.getItem('de_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}

// ---------- Boot ----------
loadSession();
applyTheme();
if (session) {
  showApp();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // installability/offline caching is a nice-to-have — don't block the app if it fails
  });
}
