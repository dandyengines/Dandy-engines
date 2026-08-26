const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');
const { recordHistory, clone } = require('./_history');
const { notifyUser } = require('./_push');

const SHEET_IDS = ['jake', 'mike', 'frank', 'sab', 'lou'];

function canView(user) { return user.rottler !== null && user.rottler !== undefined; }
function canInput(user) { return user.role === 'admin' || user.rottler === 'input'; }

function nowISO() { return new Date().toISOString(); }

async function loadRottler(store) {
  const data = await store.get('rottler', { type: 'json' });
  return data || { entries: [] };
}
async function saveRottler(store, data) {
  await store.setJSON('rottler', data);
}
async function loadSheet(store, sheet) {
  const data = await store.get(`sheet:${sheet}`, { type: 'json' });
  return data || { jobs: [], order: [] };
}
async function saveSheet(store, sheet, data) {
  await store.setJSON(`sheet:${sheet}`, data);
}

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session) return json(401, { error: 'Not logged in' });
  const { user } = session;
  if (!canView(user)) return json(403, { error: 'Forbidden' });

  const store = getBlobStore('jobs'); // shared store, separate keys
  const params = event.queryStringParameters || {};

  if (event.httpMethod === 'GET') {
    if (params.action === 'list') {
      const data = await loadRottler(store);
      return json(200, { entries: data.entries, canInput: canInput(user) });
    }

    if (params.action === 'lookup') {
      // Look up a job number across every person sheet, to power Gus's
      // "is this the correct job?" confirmation prompt.
      const q = (params.jobNumber || '').trim();
      if (!q) return json(200, { match: null });

      for (const sheet of SHEET_IDS) {
        const data = await loadSheet(store, sheet);
        const found = data.jobs.find((j) => (j.jobNumber || '').trim().toLowerCase() === q.toLowerCase());
        if (found) {
          return json(200, {
            match: { sheet, jobId: found.id, customer: found.customer, engine: found.engine },
          });
        }
      }
      return json(200, { match: null });
    }

    return json(400, { error: 'Unknown action' });
  }

  if (event.httpMethod === 'POST') {
    if (!canInput(user)) return json(403, { error: 'Forbidden' });
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }

    const rStore = getBlobStore('jobs');
    const data = await loadRottler(rStore);

    if (body.action === 'create' || body.action === 'redo') {
      const before = clone(data);
      const pistonOD = parseFloat(body.pistonOD);
      const boreSize = parseFloat(body.boreSize);
      const clearance = (!isNaN(pistonOD) && !isNaN(boreSize)) ? +(boreSize - pistonOD).toFixed(4) : null;

      const entry = {
        id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        personResponsible: body.personResponsible || user.userId,
        dateAdded: nowISO(),
        jobNumber: body.jobNumber || '',
        customer: body.customer || '',
        engine: body.engine || '',
        pistonOD: isNaN(pistonOD) ? null : pistonOD,
        boreSize: isNaN(boreSize) ? null : boreSize,
        clearance,
        torquePlate: body.torquePlate?.on ? { on: true, value: body.torquePlate.value || '' } : { on: false, value: '' },
        raceHone: body.raceHone?.on
          ? { on: true, rpk: body.raceHone.rpk || '', rk: body.raceHone.rk || '', rvk: body.raceHone.rvk || '', angle: body.raceHone.angle || '' }
          : { on: false },
        notes: body.notes || '',
        redoOf: body.action === 'redo' ? body.redoOfId : null,
        enteredBy: user.name,
      };

      data.entries.unshift(entry);
      await recordHistory(rStore, { key: 'rottler', before, description: `${user.name} ${body.action === 'redo' ? 'redid' : 'added'} Rottler entry for job ${entry.jobNumber || '(no #)'}`, userName: user.name, area: 'rottler' });
      await saveRottler(rStore, data);

      for (const uid of ['jake', 'mike']) {
        if (uid === session.userId) continue;
        notifyUser(rStore, uid, 'rottlerEntries', {
          title: 'Dandy Engines — Rottler', body: `${user.name} ${body.action === 'redo' ? 'redid' : 'added'} a Rottler entry for job ${entry.jobNumber || '(no #)'}.`,
        });
      }

      // If linked to a job on a person sheet, add a timestamped note there.
      if (body.linkedSheet && body.linkedJobId) {
        const sheetData = await loadSheet(rStore, body.linkedSheet);
        const job = sheetData.jobs.find((j) => j.id === body.linkedJobId);
        if (job) {
          job.notes.push({
            text: `Rottler data recorded — Piston OD ${entry.pistonOD ?? '—'}, Bore ${entry.boreSize ?? '—'}, Clearance ${entry.clearance ?? '—'}${entry.notes ? ' — ' + entry.notes : ''}`,
            timestamp: nowISO(),
            author: user.name,
            auto: true,
          });
          await saveSheet(rStore, body.linkedSheet, sheetData);
        }
      }

      return json(200, { entry });
    }

    return json(400, { error: 'Unknown action' });
  }

  return json(405, { error: 'Method not allowed' });
};
