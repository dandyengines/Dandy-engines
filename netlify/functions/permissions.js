// Powers Settings -> Manage Team Permissions. Admin-only (or anyone granted
// 'edit' on the "settings" tab in the matrix itself — see the note in
// _permissions.js about promoting a staff member to effectively-admin).
const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');
const { USERS } = require('./roles');
const { TAB_DEFS, TAB_IDS, loadMatrix, saveMatrix, computeDefaultMatrix } = require('./_permissions');

const LEVELS = ['view', 'edit', 'unseen'];

function canManage(user) {
  return user.isSuperAdmin || user.perms.settings === 'edit';
}

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session || !canManage(session.user)) return json(403, { error: 'Forbidden' });

  const store = getBlobStore('jobs');

  if (event.httpMethod === 'GET') {
    const matrix = await loadMatrix(store);
    const users = Object.entries(USERS).map(([id, u]) => ({ id, name: u.name }));
    return json(200, { matrix, users, tabDefs: TAB_DEFS });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }

    if (body.action === 'set') {
      const { userId, tabId, level } = body;
      if (!USERS[userId]) return json(400, { error: 'Unknown user' });
      if (!TAB_IDS.includes(tabId)) return json(400, { error: 'Unknown tab' });
      if (!LEVELS.includes(level)) return json(400, { error: 'Level must be view, edit, or unseen' });
      const matrix = await loadMatrix(store);
      matrix[userId] = matrix[userId] || {};
      matrix[userId][tabId] = level;
      await saveMatrix(store, matrix);
      return json(200, { ok: true, matrix });
    }

    if (body.action === 'reset') {
      // Re-seed from roles.js defaults, discarding all admin overrides.
      const matrix = computeDefaultMatrix();
      await saveMatrix(store, matrix);
      return json(200, { ok: true, matrix });
    }

    return json(400, { error: 'Unknown action' });
  }

  return json(405, { error: 'Method not allowed' });
};
