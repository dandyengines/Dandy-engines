// ===== Push notifications & alert preferences (Settings tab) =====

const ALERT_CATEGORY_LABELS = {
  ownSheetChange: 'Someone edits a job on your sheet',
  urgentFlag: 'A job is flagged Urgent',
  newJobFromPayments: 'A new job is added via Part Payments',
  rottlerEntries: 'A Rottler entry is added (Jake/Mike)',
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

  return `
    <div class="stub-card" style="margin-top:14px;">
      <h2>Alerts</h2>
      ${status.subscribed
        ? `<label class="chip-toggle" style="margin-bottom:12px;"><input type="checkbox" id="alerts-master" ${status.alertsEnabled ? 'checked' : ''}> Notifications enabled on this device</label>`
        : `<button id="enable-alerts-btn" class="btn-primary" style="margin-bottom:12px;">🔔 Enable Alerts</button>
           <p class="muted-sm" style="margin-bottom:12px;">On iPhone, this only works once the app is added to your Home Screen (Share → Add to Home Screen).</p>`
      }
      <div id="alert-categories">${rows}</div>
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
  } catch (e) {
    alert("Couldn't enable alerts: " + e.message);
  }
}
