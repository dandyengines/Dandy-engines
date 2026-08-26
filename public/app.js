// ===== Dandy Engines — Stage 1: scaffold + auth =====
// Later stages plug real tab content into renderTab(); for now each tab
// shows a placeholder so the nav/permissions/theme system can be reviewed
// and tested before the data-heavy screens are built.

const TAB_LABELS = {
  home: '🏠 Home',
  alljobs: '📋 All Builds',
  allmachining: '🛠️ All Machining',
  rottler: '⚙️ Rottler',
  tunnelvision: '🌀 Tunnel Vision',
  machining: "🛠️ Jake's Machining",
  machining_lou: "🛠️ Lou's Machining",
  machining_sab: "🛠️ Sab's Machining",
  machining_mike: "🛠️ Mike's Machining",
  balancing: '⚖️ Balancing',
  invoicesawaiting: '💳 Invoices Awaiting Payment',
  partpayments: '💰 Part Payments',
  settings: '⚙️ Settings',
  history: '🕘 History',
};

let session = null; // { token, userId, name, role, tabs, ... }
let activeTab = 'home';
let navLabelMap = {}; // tabId -> full label (including emoji), including expanded builds_/machining_ ids
let navTabIds = []; // ordered list of actual tab ids currently in the nav

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
  wireHeader();
  setActiveTab(navTabIds.includes('home') ? 'home' : navTabIds[0]);
}

function wireHeader() {
  document.getElementById('topbar-user').textContent = `${session.name} · ${session.role}`;
  document.getElementById('settings-shortcut').addEventListener('click', () => setActiveTab('settings'));
  wireSearchBubble();
  refreshAlertsIndicator();
}

async function refreshAlertsIndicator() {
  const btn = document.getElementById('alerts-indicator');
  try {
    const status = await api('/.netlify/functions/push-subscribe');
    const on = !!(status.subscribed && status.alertsEnabled);
    btn.textContent = on ? '🔔' : '🔕';
    btn.title = on ? 'Alerts on — tap Settings to manage' : 'Alerts off — tap Settings to enable';
  } catch {
    btn.textContent = '🔕';
  }
  btn.onclick = () => setActiveTab('settings');
}

function labelForTab(tabId) {
  if (TAB_LABELS[tabId]) return TAB_LABELS[tabId];
  if (tabId.startsWith('builds_')) return `🔧 ${(PERSON_NAMES[tabId.slice('builds_'.length)] || tabId)}'s Builds`;
  if (tabId === 'machining' || tabId.startsWith('machining_')) return `🛠️ ${MACHINING_LABELS[tabId] || tabId}`;
  return tabId;
}

function buildNav() {
  const sidebarTabs = document.getElementById('sidebar-tabs');
  const bottomNav = document.getElementById('bottom-nav');
  const sidebarUser = document.getElementById('sidebar-user');

  sidebarTabs.innerHTML = '';
  bottomNav.innerHTML = '';

  // session.tabs now comes directly from the live, admin-editable permission
  // matrix (see _permissions.js), already in this person's own custom order
  // (see tab-order.js) — every entry (including builds_<person> and
  // machining_<person>) is already the exact set this user can access.
  const navEntries = session.tabs
    .filter((t) => t !== 'history') // History is reached from inside Settings, not the sidebar
    .map((tabId) => ({ id: tabId, label: labelForTab(tabId) }));

  // Desktop sidebar: full list, in the person's custom order.
  navEntries.forEach(({ id: tabId, label }) => {
    const sideBtn = document.createElement('button');
    sideBtn.className = 'tab-btn';
    sideBtn.dataset.tab = tabId;
    sideBtn.textContent = label;
    sideBtn.addEventListener('click', () => setActiveTab(tabId));
    sidebarTabs.appendChild(sideBtn);
  });

  // Phone bottom bar: only the first three (their pinned "quick view"
  // tabs) plus a grip handle that opens the full list as a swipe-up sheet.
  navEntries.slice(0, 3).forEach(({ id: tabId, label }) => {
    const bottomBtn = document.createElement('button');
    bottomBtn.className = 'tab-btn';
    bottomBtn.dataset.tab = tabId;
    bottomBtn.innerHTML = label;
    bottomBtn.addEventListener('click', () => setActiveTab(tabId));
    bottomNav.appendChild(bottomBtn);
  });
  const gripBtn = document.createElement('button');
  gripBtn.className = 'bottom-nav-grip';
  gripBtn.setAttribute('aria-label', 'Show all tabs');
  gripBtn.innerHTML = '<span class="grip-handle"></span><span class="grip-label">More</span>';
  bottomNav.appendChild(gripBtn);
  wireTabSheetGrip(gripBtn, navEntries);

  navLabelMap = Object.fromEntries(navEntries.map((e) => [e.id, e.label]));
  navTabIds = navEntries.map((e) => e.id);

  sidebarUser.textContent = `${session.name} · ${session.role}`;
}

// ===== Phone: swipe-up (or tap) sheet showing every tab =====
function wireTabSheetGrip(gripBtn, navEntries) {
  gripBtn.addEventListener('click', () => openTabSheet(navEntries));

  // Swipe-up gesture as an alternative to tapping — a short upward drag
  // starting on the grip opens the sheet; tap still works regardless, so
  // this is purely an extra convenience, never a requirement.
  let startY = null;
  gripBtn.addEventListener('pointerdown', (e) => { startY = e.clientY; });
  gripBtn.addEventListener('pointermove', (e) => {
    if (startY === null) return;
    if (startY - e.clientY > 30) { // dragged up at least 30px
      startY = null;
      openTabSheet(navEntries);
    }
  });
  gripBtn.addEventListener('pointerup', () => { startY = null; });
  gripBtn.addEventListener('pointercancel', () => { startY = null; });
}

function openTabSheet(navEntries) {
  const overlay = document.getElementById('tab-sheet-overlay');
  const grid = document.getElementById('tab-sheet-grid');
  grid.innerHTML = navEntries.map(({ id, label }) => `
    <button class="tab-sheet-btn ${id === activeTab ? 'active' : ''}" data-tab="${id}">${label}</button>
  `).join('');
  grid.querySelectorAll('.tab-sheet-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeTabSheet();
      setActiveTab(btn.dataset.tab);
    });
  });
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function closeTabSheet() {
  const overlay = document.getElementById('tab-sheet-overlay');
  overlay.classList.remove('open');
  setTimeout(() => { overlay.hidden = true; }, 200);
}

function setActiveTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.getElementById('page-title').textContent = (navLabelMap[tabId] || TAB_LABELS[tabId] || tabId).replace(/^\S+\s/, '');
  renderTab(tabId);
}

// ---------- Tab content ----------
function renderTab(tabId) {
  const content = document.getElementById('content');

  if (tabId === 'home') {
    renderHomeTab();
    return;
  }
  if (tabId === 'invoicesawaiting') {
    renderInvoicesAwaitingTab();
    return;
  }
  if (tabId === 'settings') {
    content.innerHTML = renderSettings();
    wireSettings();
    alertsSettingsHTML().then((html) => {
      const holder = document.getElementById('alerts-holder');
      if (holder) { holder.innerHTML = html; wireAlertsSettings(); }
    });
    return;
  }
  if (tabId.startsWith('builds_')) {
    renderMyJobsTab(tabId.slice('builds_'.length));
    return;
  }
  if (tabId === 'alljobs') {
    renderAllJobsTab();
    return;
  }
  if (tabId === 'allmachining') {
    renderAllMachiningTab();
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
  if (tabId === 'balancing') {
    renderBalancingTab();
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
  if (tabId === 'machining' || tabId.startsWith('machining_')) {
    renderMachiningTab(tabId);
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
  const undoDuration = parseInt(localStorage.getItem('de_undo_duration') || '5', 10);
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
    <div class="stub-card" style="margin-top:14px;">
      <h2>Undo Toast Duration</h2>
      <p class="muted-sm">How long the "Undo" option stays available after deleting or completing a job.</p>
      <div class="toolbar-group" style="margin-top:8px;">
        ${[3, 5, 10].map((s) => `<button class="chip undo-duration-btn ${undoDuration === s ? 'chip-active' : ''}" data-secs="${s}">${s}s</button>`).join('')}
      </div>
    </div>
    <div class="stub-card" style="margin-top:14px;">
      <h2>Reorder My Tabs</h2>
      <p class="muted-sm">Drag your tabs into whatever order suits you. Your first three become the quick-access buttons at the bottom on your phone.</p>
      <button id="open-tab-order-btn" style="margin-top:10px;padding:8px 14px;border-radius:8px;border:1px solid var(--hairline);background:var(--panel-raised);color:var(--text);">Reorder Tabs</button>
    </div>
    ${(session.role === 'admin' || session.perms?.settings === 'edit') ? `
    <div class="stub-card" style="margin-top:14px;">
      <h2>Manage Team Permissions</h2>
      <p class="muted-sm">Set exactly what every person can see and edit, tab by tab. Changes apply immediately, next time they load that tab.</p>
      <button id="open-permissions-btn" style="margin-top:10px;padding:8px 14px;border-radius:8px;border:1px solid var(--hairline);background:var(--panel-raised);color:var(--text);">Open Permissions</button>
    </div>
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
    </div>
    <div class="stub-card" style="margin-top:14px;">
      <h2>Fix Job Numbers ("40309.0" → "40309")</h2>
      <p class="muted-sm">One-time cleanup for job numbers and TV numbers imported with a trailing ".0". Safe to run more than once — anything already clean is skipped.</p>
      <button id="cleanup-jobnums-btn" style="margin-top:10px;padding:8px 14px;border-radius:8px;border:1px solid var(--hairline);background:var(--panel-raised);color:var(--text);">Check How Many Need Fixing</button>
      <div id="cleanup-jobnums-result" class="muted-sm" style="margin-top:10px;"></div>
    </div>
    <div class="stub-card" style="margin-top:14px;">
      <h2>Legacy Upload Portal</h2>
      <p class="muted-sm">Download a template, add rows for anything not already in the app, then upload it back. Only genuinely new job numbers are added — anything already in the app is left untouched.</p>
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
        <a href="/templates/Dandy-Engines-Jobs-Import-Template.xlsx" download style="padding:8px 14px;border-radius:8px;border:1px solid var(--hairline);background:var(--panel-raised);color:var(--text);text-decoration:none;">⬇ Jobs Template</a>
        <a href="/templates/Dandy-Engines-Rottler-Import-Template.xlsx" download style="padding:8px 14px;border-radius:8px;border:1px solid var(--hairline);background:var(--panel-raised);color:var(--text);text-decoration:none;">⬇ Rottler Template</a>
      </div>
      <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px;">
        <label>Upload a filled-in Jobs template
          <input type="file" id="upload-jobs-file" accept=".xlsx">
        </label>
        <label>Upload a filled-in Rottler template
          <input type="file" id="upload-rottler-file" accept=".xlsx">
        </label>
      </div>
      <div id="legacy-upload-result" class="muted-sm" style="margin-top:10px;"></div>
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
  document.querySelectorAll('.undo-duration-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      localStorage.setItem('de_undo_duration', btn.dataset.secs);
      renderTab('settings');
    });
  });
  document.getElementById('open-history-btn')?.addEventListener('click', () => {
    document.getElementById('page-title').textContent = 'History';
    renderHistoryTab();
  });
  document.getElementById('open-permissions-btn')?.addEventListener('click', () => {
    document.getElementById('page-title').textContent = 'Manage Team Permissions';
    renderPermissionsTab();
  });
  document.getElementById('open-tab-order-btn')?.addEventListener('click', () => {
    document.getElementById('page-title').textContent = 'Reorder My Tabs';
    renderTabOrderTab();
  });
  document.getElementById('import-legacy-btn')?.addEventListener('click', checkImportStatus);
  document.getElementById('cleanup-jobnums-btn')?.addEventListener('click', checkCleanupStatus);
  document.getElementById('upload-jobs-file')?.addEventListener('change', (e) => handleLegacyUpload(e, 'jobs'));
  document.getElementById('upload-rottler-file')?.addEventListener('change', (e) => handleLegacyUpload(e, 'rottler'));
}

async function handleLegacyUpload(e, type) {
  const file = e.target.files[0];
  if (!file) return;
  const resultEl = document.getElementById('legacy-upload-result');
  resultEl.textContent = 'Uploading and importing…';
  try {
    const fileBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const { results } = await api('/.netlify/functions/legacy-upload', {
      method: 'POST', body: JSON.stringify({ type, fileBase64 }),
    });
    resultEl.innerHTML = Object.entries(results).map(([k, v]) => `${k}: ${v}`).join('<br>');
  } catch (err) {
    resultEl.textContent = "Couldn't import: " + err.message;
  } finally {
    e.target.value = '';
  }
}

async function checkCleanupStatus() {
  const result = document.getElementById('cleanup-jobnums-result');
  result.textContent = 'Checking…';
  try {
    const { total, counts } = await api('/.netlify/functions/cleanup-job-numbers');
    if (total === 0) {
      result.textContent = 'Nothing to fix — all job numbers are already clean.';
      return;
    }
    const lines = Object.entries(counts).map(([sheet, n]) => `${sheet}: ${n} to fix`);
    result.innerHTML = `${total} total found.<br>` + lines.join('<br>') + `
      <button id="run-cleanup-btn" class="btn-primary" style="margin-top:10px;">Fix Them Now</button>
    `;
    document.getElementById('run-cleanup-btn').addEventListener('click', runCleanup);
  } catch (e) {
    result.textContent = "Couldn't check: " + e.message;
  }
}

async function runCleanup() {
  const result = document.getElementById('cleanup-jobnums-result');
  result.textContent = 'Fixing…';
  try {
    const { total, results } = await api('/.netlify/functions/cleanup-job-numbers', {
      method: 'POST', body: JSON.stringify({ action: 'run' }),
    });
    result.innerHTML = `Fixed ${total} total.<br>` + Object.entries(results).map(([k, v]) => `${k}: ${v}`).join('<br>');
  } catch (e) {
    result.textContent = "Couldn't fix: " + e.message;
  }
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

// Tab sheet: tap outside, or swipe down on the grip, to dismiss.
const tabSheetOverlay = document.getElementById('tab-sheet-overlay');
tabSheetOverlay.addEventListener('click', (e) => {
  if (e.target.id === 'tab-sheet-overlay') closeTabSheet();
});
const tabSheetGrip = tabSheetOverlay.querySelector('.tab-sheet-grip');
let sheetDragStartY = null;
tabSheetGrip.addEventListener('pointerdown', (e) => { sheetDragStartY = e.clientY; });
tabSheetGrip.addEventListener('pointermove', (e) => {
  if (sheetDragStartY === null) return;
  if (e.clientY - sheetDragStartY > 30) { sheetDragStartY = null; closeTabSheet(); }
});
tabSheetGrip.addEventListener('pointerup', () => { sheetDragStartY = null; });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // installability/offline caching is a nice-to-have — don't block the app if it fails
  });
}
