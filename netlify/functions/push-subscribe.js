const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');
const { CATEGORIES, VAPID_PUBLIC } = require('./_push');

async function loadSubs(store) {
  const data = await store.get('push-subs', { type: 'json' });
  return data || {};
}
async function saveSubs(store, data) {
  await store.setJSON('push-subs', data);
}

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session) return json(401, { error: 'Not logged in' });

  const store = getBlobStore('jobs');

  if (event.httpMethod === 'GET') {
    // Public VAPID key + this user's current prefs, so Settings can render
    // the toggle states correctly.
    const subs = await loadSubs(store);
    const record = subs[session.userId] || { alertsEnabled: false, prefs: {} };
    return json(200, { vapidPublicKey: VAPID_PUBLIC, alertsEnabled: record.alertsEnabled, prefs: record.prefs, subscribed: !!record.subscription });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }

    const subs = await loadSubs(store);
    const existing = subs[session.userId] || { prefs: {} };

    if (body.action === 'subscribe') {
      // One active subscription per person — enabling on a new device
      // replaces the old one, same as the reference app.
      subs[session.userId] = {
        subscription: body.subscription,
        alertsEnabled: existing.alertsEnabled !== false,
        prefs: existing.prefs || {},
      };
      await saveSubs(store, subs);
      return json(200, { ok: true });
    }

    if (body.action === 'unsubscribe') {
      subs[session.userId] = { ...existing, subscription: null };
      await saveSubs(store, subs);
      return json(200, { ok: true });
    }

    if (body.action === 'setPrefs') {
      const prefs = {};
      for (const cat of CATEGORIES) {
        if (cat in (body.prefs || {})) prefs[cat] = !!body.prefs[cat];
      }
      subs[session.userId] = {
        ...existing,
        alertsEnabled: 'alertsEnabled' in body ? !!body.alertsEnabled : existing.alertsEnabled,
        prefs: { ...existing.prefs, ...prefs },
      };
      await saveSubs(store, subs);
      return json(200, { ok: true });
    }

    return json(400, { error: 'Unknown action' });
  }

  return json(405, { error: 'Method not allowed' });
};
