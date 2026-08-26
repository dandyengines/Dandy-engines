// ===== Push notifications & alert preferences (Settings tab) =====

const ALERT_CATEGORY_LABELS = {
  ownSheetChange: 'Someone edits a job on your sheet',
  urgentFlag: 'A job is flagged Urgent',
  newJobFromPayments: 'A new job is added via Part Payments',
  newJobOnMySheet: 'A new job is added to your Builds/Machining sheet',
  noteAddedToMySheet: 'A note is added to a job on your sheet',
  jobAwaitingPayment: "A job you're responsible for reaches Awaiting Payment",
  rottlerEntries: 'A Rottler entry is added',
  balancingEntries: 'A Balancing entry is added',
  partPaymentsEntries: 'A Part Payments entry is logged (Jake)',
};

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function alertsSettingsHTML() {
  let status;
  try {
    status = await api('/.netlify/functions/push-subscribe');
  } catch {
    return `<div class="stub-card" style="margin-top:14px;"><h2>Alerts</h2><p class="muted-sm">Couldn't load alert settings.</p></div>`;
  }

  const rows = Object.entries(ALERT_CATEGORY_LABELS)
    .map(([key, label]) => `
      <label class="chip-toggle" style="width:100%;justify-content:flex-start;margin-bottom:6px;">
        <input type="checkbox" class="alert-cat" data-cat="${key}" ${status.prefs?.[key] !== false ? 'checked' : ''}> ${label}
      </label>`)
    .join('');

  const selectedStages = new Set(status.statusAlertStages || []);
  const stageCheckboxes = STAGES.map((s) => `
    <label class="chip-toggle" style="width:100%;justify-content:flex-start;margin-bottom:4px;font-size:12px;">
      <input type="checkbox" class="alert-stage" value="${s.id}" ${selectedStages.has(s.id) ? 'checked' : ''}> ${s.label}
    </label>`).join('');

  return `
    <div class="stub-card" style="margin-top:14px;">
      <h2>Alerts</h2>
      ${status.subscribed
        ? `<label class="chip-toggle" style="margin-bottom:12px;"><input type="checkbox" id="alerts-master" ${status.alertsEnabled ? 'checked' : ''}> Notifications enabled on this device</label>`
        : `<button id="enable-alerts-btn" class="btn-primary" style="margin-bottom:12px;">🔔 Enable Alerts</button>
           <p class="muted-sm" style="margin-bottom:12px;">On iPhone, this only works once the app is added to your Home Screen (Share → Add to Home Screen).</p>`
      }
      <div id="alert-categories">${rows}</div>
      <div class="stub-card" style="margin-top:10px;background:var(--bg);">
        <h3 style="font-size:13px;color:var(--muted);text-transform:uppercase;margin-bottom:8px;">A job on your sheet moves to a status you choose:</h3>
        <label class="chip-toggle" style="width:100%;justify-content:flex-start;margin-bottom:8px;">
          <input type="checkbox" id="alert-statuschange" ${status.prefs?.statusChangeAlert !== false ? 'checked' : ''}> Enable status-change alerts (only for statuses ticked below)
        </label>
        <div id="alert-stage-list">${stageCheckboxes}</div>
      </div>
    </div>
  `;
}

function wireAlertsSettings() {
  document.getElementById('enable-alerts-btn')?.addEventListener('click', enablePush);
  document.getElementById('alerts-master')?.addEventListener('change', async (e) => {
    await api('/.netlify/functions/push-subscribe', {
      method: 'POST',
      body: JSON.stringify({ action: 'setPrefs', alertsEnabled: e.target.checked }),
    });
    refreshAlertsIndicator();
  });
  document.querySelectorAll('.alert-cat').forEach((cb) => {
    cb.addEventListener('change', async () => {
      const prefs = {};
      document.querySelectorAll('.alert-cat').forEach((c) => { prefs[c.dataset.cat] = c.checked; });
      try {
        await api('/.netlify/functions/push-subscribe', { method: 'POST', body: JSON.stringify({ action: 'setPrefs', prefs }) });
      } catch (e) { alert("Couldn't save: " + e.message); }
    });
  });
  document.getElementById('alert-statuschange')?.addEventListener('change', async (e) => {
    try {
      await api('/.netlify/functions/push-subscribe', {
        method: 'POST', body: JSON.stringify({ action: 'setPrefs', prefs: { statusChangeAlert: e.target.checked } }),
      });
    } catch (err) { alert("Couldn't save: " + err.message); }
  });
  document.querySelectorAll('.alert-stage').forEach((cb) => {
    cb.addEventListener('change', async () => {
      const statusAlertStages = Array.from(document.querySelectorAll('.alert-stage:checked')).map((c) => c.value);
      try {
        await api('/.netlify/functions/push-subscribe', { method: 'POST', body: JSON.stringify({ action: 'setPrefs', statusAlertStages }) });
      } catch (e) { alert("Couldn't save: " + e.message); }
    });
  });
}

async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Push notifications are not supported in this browser.');
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const { vapidPublicKey } = await api('/.netlify/functions/push-subscribe');
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    await api('/.netlify/functions/push-subscribe', {
      method: 'POST',
      body: JSON.stringify({ action: 'subscribe', subscription }),
    });

    // Re-render settings to show the "enabled" state
    renderTab('settings');
    refreshAlertsIndicator();
  } catch (e) {
    alert("Couldn't enable alerts: " + e.message);
  }
}
