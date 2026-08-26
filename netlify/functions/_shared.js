const { getBlobStore } = require('./_store');
const { USERS } = require('./roles');

// Reads the Bearer token from the request, looks it up in the sessions
// store, and returns { userId, user } or null if invalid/missing.
async function getSession(event) {
  const header = event.headers.authorization || event.headers.Authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7);

  const sessions = getBlobStore('sessions');
  const record = await sessions.get(token, { type: 'json' });
  if (!record || !USERS[record.userId]) return null;

  return { userId: record.userId, user: USERS[record.userId] };
}

function json(statusCode, data) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

module.exports = { getSession, json };
