const { getBlobStore } = require('./_store');
const { USERS } = require('./roles');
const { loadMatrix, getPerm, TAB_IDS } = require('./_permissions');

// Reads the Bearer token from the request, looks it up in the sessions
// store, and returns { userId, user } or null if invalid/missing.
// `user` here is enriched with the LIVE permission matrix on every call
// (via user.perms and user.tabs) — this is now the single source of truth
// for access control app-wide, so a change Jake makes in Settings takes
// effect on the very next request, everywhere, with no other code changes.
async function getSession(event) {
  const header = event.headers.authorization || event.headers.Authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7);

  const sessions = getBlobStore('sessions');
  const record = await sessions.get(token, { type: 'json' });
  if (!record || !USERS[record.userId]) return null;

  const baseUser = USERS[record.userId]; // never mutate this shared object directly
  const isSuperAdmin = baseUser.role === 'admin';
  const permStore = getBlobStore('jobs'); // permissions live in the same shared store
  const matrix = await loadMatrix(permStore);
  const perms = {};
  for (const tabId of TAB_IDS) perms[tabId] = getPerm(matrix, record.userId, tabId, isSuperAdmin);
  const tabs = TAB_IDS.filter((id) => perms[id] !== 'unseen');

  const user = { ...baseUser, perms, tabs, isSuperAdmin };
  return { userId: record.userId, user };
}

function json(statusCode, data) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

module.exports = { getSession, json };
