const crypto = require('crypto');
const { getBlobStore } = require('./_store');
const { USERS } = require('./roles');
const { loadMatrix, getPerm, TAB_IDS } = require('./_permissions');

// Simple opaque session token store, backed by Netlify Blobs so it survives
// across function invocations (each request may hit a different instance).
function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) };
  }

  const { password } = body;
  if (!password || typeof password !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Password required' }) };
  }

  // Find the user whose password matches. Passwords are per-person and not
  // usernames, so we scan (only 9 entries -- fine).
  const match = Object.entries(USERS).find(
    ([, u]) => u.password === password
  );

  if (!match) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Wrong password' }) };
  }

  const [userId, user] = match;

  try {
    const sessions = getBlobStore('sessions');
    const token = makeToken();
    await sessions.setJSON(token, {
      userId,
      createdAt: new Date().toISOString(),
    });

    // Compute the live, admin-editable tab list — not the static roles.js
    // default — so a permission change Jake made takes effect immediately,
    // even for someone logging in for the first time since that change.
    const isSuperAdmin = user.role === 'admin';
    const permStore = getBlobStore('jobs');
    const matrix = await loadMatrix(permStore);
    const perms = {};
    for (const tabId of TAB_IDS) perms[tabId] = getPerm(matrix, userId, tabId, isSuperAdmin);
    const tabs = TAB_IDS.filter((id) => perms[id] !== 'unseen');

    return {
      statusCode: 200,
      body: JSON.stringify({
        token,
        userId,
        name: user.name,
        role: user.role,
        personSheet: user.personSheet,
        editsOwnSheet: user.editsOwnSheet,
        viewSheets: user.viewSheets,
        rottler: user.rottler,
        perms,
        tabs,
      }),
    };
  } catch (err) {
    // Surfaced by the client as "Server error (4xx/5xx)... auth function may
    // not be deployed" per the troubleshooting guide in the README.
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error', detail: String(err) }) };
  }
};
