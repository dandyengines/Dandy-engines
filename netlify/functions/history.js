const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');
const { listHistory, revertHistory } = require('./_history');

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session || session.user.role !== 'admin') return json(403, { error: 'Forbidden' });

  const store = getBlobStore('jobs'); // shared store, 'history' key

  if (event.httpMethod === 'GET') {
    const entries = await listHistory(store);
    return json(200, { entries });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }
    if (body.action !== 'revert' || !body.historyId) return json(400, { error: 'Unknown action' });

    const result = await revertHistory(store, body.historyId);
    if (!result.ok) return json(404, { error: result.error });
    return json(200, { reverted: true, key: result.key });
  }

  return json(405, { error: 'Method not allowed' });
};
