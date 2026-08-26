const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');
const legacyData = require('./legacy-data.json');

const SHEET_IDS = ['lou', 'frank', 'sab', 'mike', 'jake', 'machining'];

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session || session.user.role !== 'admin') return json(403, { error: 'Forbidden' });

  const store = getBlobStore('jobs');

  if (event.httpMethod === 'GET') {
    // Report whether each destination already has data, so the UI can
    // warn before overwriting anything real.
    const status = {};
    for (const sheet of SHEET_IDS) {
      const existing = await store.get(`sheet:${sheet}`, { type: 'json' });
      status[sheet] = { existingJobs: existing ? existing.jobs.length : 0, importJobs: legacyData.sheets[sheet].jobs.length };
    }
    const existingTV = await store.get('tunnelvision', { type: 'json' });
    const existingRottler = await store.get('rottler', { type: 'json' });
    status.tunnelvision = { existingJobs: existingTV ? existingTV.jobs.length : 0, importJobs: legacyData.tunnelvision.jobs.length };
    status.rottler = { existingEntries: existingRottler ? existingRottler.entries.length : 0, importEntries: legacyData.rottler.entries.length };

    return json(200, { status });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }
    if (body.action !== 'run') return json(400, { error: 'Unknown action' });

    const force = !!body.force;
    const results = {};

    for (const sheet of SHEET_IDS) {
      const existing = await store.get(`sheet:${sheet}`, { type: 'json' });
      if (existing && existing.jobs.length > 0 && !force) {
        results[sheet] = 'skipped (already has data — pass force to overwrite)';
        continue;
      }
      await store.setJSON(`sheet:${sheet}`, legacyData.sheets[sheet]);
      results[sheet] = `imported ${legacyData.sheets[sheet].jobs.length} jobs`;
    }

    const existingTV = await store.get('tunnelvision', { type: 'json' });
    if (existingTV && existingTV.jobs.length > 0 && !force) {
      results.tunnelvision = 'skipped (already has data — pass force to overwrite)';
    } else {
      await store.setJSON('tunnelvision', legacyData.tunnelvision);
      results.tunnelvision = `imported ${legacyData.tunnelvision.jobs.length} jobs`;
    }

    const existingRottler = await store.get('rottler', { type: 'json' });
    if (existingRottler && existingRottler.entries.length > 0 && !force) {
      results.rottler = 'skipped (already has data — pass force to overwrite)';
    } else {
      await store.setJSON('rottler', legacyData.rottler);
      results.rottler = `imported ${legacyData.rottler.entries.length} entries`;
    }

    return json(200, { results });
  }

  return json(405, { error: 'Method not allowed' });
};
