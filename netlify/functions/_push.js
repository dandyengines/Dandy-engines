const webpush = require('web-push');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || 'BDYoarIx-E_x8vC__-VIcmt8Si6fn9Li9s74buM5rstwWrRBoJhZPW6AinoZTA42fO2gWmSO4meR6259ZiD1B0U';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || 'svQS3eDCJobCpcX69sGgEFT2OCRPwYLxyQ774x9kAik';

webpush.setVapidDetails('mailto:admin@dandyengines.com', VAPID_PUBLIC, VAPID_PRIVATE);

// Categories match the simple on/off toggles in Settings.
const CATEGORIES = ['ownSheetChange', 'urgentFlag', 'newJobFromPayments', 'rottlerEntries', 'partPaymentsEntries'];

async function loadSubs(store) {
  const data = await store.get('push-subs', { type: 'json' });
  return data || {};
}

// Sends a push to one user if they have a subscription, alerts enabled
// overall, and this specific category enabled. Never throws — a failed or
// missing subscription just means the notification is silently skipped so
// it never blocks the action that triggered it.
async function notifyUser(store, userId, category, { title, body }) {
  try {
    const subs = await loadSubs(store);
    const record = subs[userId];
    if (!record || !record.subscription || record.alertsEnabled === false) return;
    if (record.prefs && record.prefs[category] === false) return;

    await webpush.sendNotification(
      record.subscription,
      JSON.stringify({ title, body })
    );
  } catch {
    // Expired/invalid subscriptions, network hiccups, etc. — non-fatal.
  }
}

module.exports = { notifyUser, CATEGORIES, VAPID_PUBLIC };
