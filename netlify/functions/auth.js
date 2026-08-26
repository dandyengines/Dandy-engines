const crypto = require('crypto');
const { getBlobStore } = require('./_store');
const { USERS } = require('./roles');

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
        tabs: user.tabs,
      }),
    };
  } catch (err) {
    // Surfaced by the client as "Server error (4xx/5xx)... auth function may
    // not be deployed" per the troubleshooting guide in the README.
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error', detail: String(err) }) };
  }
};
