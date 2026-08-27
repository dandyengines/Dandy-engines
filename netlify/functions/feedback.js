const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');

function canManage(user) {
  return user.isSuperAdmin || user.perms.settings === 'edit';
}

async function loadFeedback(store) {
  const data = await store.get('feedback', { type: 'json' });
  return data || { entries: [] };
}
async function saveFeedback(store, data) {
  await store.setJSON('feedback', data);
}

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session) return json(401, { error: 'Not logged in' });
  const { user } = session;

  const store = getBlobStore('jobs');

  if (event.httpMethod === 'GET') {
    // Anyone can check the count (for their own confirmation after
    // submitting), but only an admin (or granted settings-edit) gets the
    // full list of entries.
    const data = await loadFeedback(store);
    if (canManage(user)) return json(200, { entries: data.entries, count: data.entries.length });
    return json(200, { entries: [], count: data.entries.length });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }

    if (body.action === 'submit') {
      const text = (body.text || '').trim();
      if (!text) return json(400, { error: 'Feedback text is required' });
      const data = await loadFeedback(store);
      data.entries.unshift({
        id: 'fb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        text,
        userId: session.userId,
        userName: user.name,
        createdAt: new Date().toISOString(),
      });
      await saveFeedback(store, data);
      return json(200, { ok: true });
    }

    if (body.action === 'delete') {
      if (!canManage(user)) return json(403, { error: 'Forbidden' });
      const data = await loadFeedback(store);
      data.entries = data.entries.filter((e) => e.id !== body.id);
      await saveFeedback(store, data);
      return json(200, { entries: data.entries, count: data.entries.length });
    }

    return json(400, { error: 'Unknown action' });
  }

  return json(405, { error: 'Method not allowed' });
};
