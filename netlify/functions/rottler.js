const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');
const { recordHistory, clone } = require('./_history');
const { notifyUser } = require('./_push');

const SHEET_IDS = ['jake', 'mike', 'frank', 'sab', 'lou'];
// Rottler linking/autocomplete also covers Machining jobs, not just Builds.
const MACHINING_SHEET_IDS = ['machining', 'machining_lou', 'machining_sab', 'machining_mike'];
const ALL_LINKABLE_SHEET_IDS = [...SHEET_IDS, ...MACHINING_SHEET_IDS];

function canView(user) { return user.perms.rottler !== 'unseen'; }
function canInput(user) { return user.perms.rottler === 'edit'; }

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
      // Look up a job number across every Build AND Machining sheet, to
      // power Gus's "is this the correct job?" confirmation prompt.
      const q = (params.jobNumber || '').trim();
      if (!q) return json(200, { match: null });

      for (const sheet of ALL_LINKABLE_SHEET_IDS) {
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

    if (params.action === 'autocomplete') {
      // Live-suggestion dropdown as the job # is typed — partial match
      // across every Build AND Machining sheet, up to 8 results.
      const q = (params.q || '').trim().toLowerCase();
      if (q.length < 1) return json(200, { suggestions: [] });

      const suggestions = [];
      for (const sheet of ALL_LINKABLE_SHEET_IDS) {
        const data = await loadSheet(store, sheet);
        for (const j of data.jobs) {
          if ((j.jobNumber || '').toLowerCase().includes(q)) {
            suggestions.push({ sheet, jobId: j.id, jobNumber: j.jobNumber, customer: j.customer, engine: j.engine });
            if (suggestions.length >= 8) break;
          }
        }
        if (suggestions.length >= 8) break;
      }
      return json(200, { suggestions });
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
          ? { on: true, rpk: body.raceHone.rpk || '', rk: body.raceHone.rk || '', rvk: body.raceHone.rvk || '', angle: body.raceHone.angle || '', stonesUsed: body.raceHone.stonesUsed || '' }
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

    if (body.action === 'update') {
      const before = clone(data);
      const entry = data.entries.find((e) => e.id === body.entryId);
      if (!entry) return json(404, { error: 'Entry not found' });
      const patchable = ['jobNumber', 'customer', 'engine', 'pistonOD', 'boreSize', 'torquePlate', 'raceHone', 'notes'];
      for (const key of patchable) if (key in (body.patch || {})) entry[key] = body.patch[key];
      // Recompute clearance if either dimension changed.
      const p = parseFloat(entry.pistonOD), b = parseFloat(entry.boreSize);
      entry.clearance = (!isNaN(p) && !isNaN(b)) ? +(b - p).toFixed(4) : null;
      await recordHistory(rStore, { key: 'rottler', before, description: `${user.name} edited Rottler entry for job ${entry.jobNumber || '(no #)'}`, userName: user.name, area: 'rottler' });
      await saveRottler(rStore, data);
      return json(200, { entry });
    }

    if (body.action === 'delete') {
      const before = clone(data);
      const idx = data.entries.findIndex((e) => e.id === body.entryId);
      if (idx === -1) return json(404, { error: 'Entry not found' });
      const [removed] = data.entries.splice(idx, 1);
      await recordHistory(rStore, { key: 'rottler', before, description: `${user.name} deleted Rottler entry for job ${removed.jobNumber || '(no #)'}`, userName: user.name, area: 'rottler' });
      await saveRottler(rStore, data);
      return json(200, { removed, removedIndex: idx });
    }

    if (body.action === 'restore') {
      const before = clone(data);
      const entry = body.entry;
      if (!entry || !entry.id) return json(400, { error: 'entry required' });
      const idx = Math.min(Math.max(body.atIndex ?? data.entries.length, 0), data.entries.length);
      data.entries.splice(idx, 0, entry);
      await recordHistory(rStore, { key: 'rottler', before, description: `${user.name} restored (undo) Rottler entry for job ${entry.jobNumber || '(no #)'}`, userName: user.name, area: 'rottler' });
      await saveRottler(rStore, data);
      return json(200, { entry });
    }

    return json(400, { error: 'Unknown action' });
  }

  return json(405, { error: 'Method not allowed' });
};
