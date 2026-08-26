const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');
const { recordHistory, clone } = require('./_history');

const BUILD_SHEET_IDS = ['jake', 'mike', 'frank', 'sab', 'lou'];
const MACHINING_SHEET_IDS = ['machining', 'machining_lou', 'machining_sab', 'machining_mike'];
const ALL_LINKABLE_SHEET_IDS = [...BUILD_SHEET_IDS, ...MACHINING_SHEET_IDS];

function canView(user) { return user.perms.balancing !== 'unseen'; }
function canInput(user) { return user.perms.balancing === 'edit'; }

function nowISO() { return new Date().toISOString(); }

async function loadBalancing(store) {
  const data = await store.get('balancing', { type: 'json' });
  return data || { entries: [] };
}
async function saveBalancing(store, data) {
  await store.setJSON('balancing', data);
}
async function loadSheet(store, sheet) {
  const data = await store.get(`sheet:${sheet}`, { type: 'json' });
  return data || { jobs: [], order: [] };
}
async function saveSheet(store, sheet, data) {
  await store.setJSON(`sheet:${sheet}`, data);
}

function balanceSummary(body) {
  // Human-readable summary of whichever fields apply, used in the
  // auto-linked note on the matching Build/Machining job.
  const parts = [`Balance Type: ${body.balanceType || '—'}`];
  if (body.pistonsBalanced) parts.push('Pistons balanced');
  if (body.rodsBalanced) parts.push('Rods balanced');
  if (body.flywheelFlexplateBalanced) parts.push('Flywheel/Flex plate balanced');
  if (body.balancerBalanced) parts.push('Balancer balanced');
  if (body.raceBalance) parts.push(`Race balance (extra hours surcharge: ${body.extraHoursSurcharge || '—'})`);
  if (body.internalExternal) parts.push(body.internalExternal);
  if (body.bobWeight) parts.push(`Bob weight ${body.bobWeight}g`);
  if (body.balanceFactor) parts.push(`Balance factor ${body.balanceFactor}%`);
  if (body.heavyMetal) parts.push(`Heavy metal (${body.numberOfPlugsUsed || '—'} plugs used)`);
  if (body.clutch) parts.push('Clutch');
  if (body.mirrorNeutralBalance) parts.push(body.mirrorNeutralBalance);
  if (body.extraTimeSurcharge) parts.push(`Extra time surcharge: ${body.extraTimeSurcharge}`);
  return parts.join(', ');
}

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session) return json(401, { error: 'Not logged in' });
  const { user } = session;
  if (!canView(user)) return json(403, { error: 'Forbidden' });

  const store = getBlobStore('jobs'); // shared store, separate key

  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    if (params.action === 'list') {
      const data = await loadBalancing(store);
      return json(200, { entries: data.entries, canInput: canInput(user) });
    }
    if (params.action === 'lookup') {
      const q = (params.jobNumber || '').trim();
      if (!q) return json(200, { match: null });
      for (const sheet of ALL_LINKABLE_SHEET_IDS) {
        const sheetData = await loadSheet(store, sheet);
        const found = sheetData.jobs.find((j) => (j.jobNumber || '').trim().toLowerCase() === q.toLowerCase());
        if (found) return json(200, { match: { sheet, jobId: found.id, customer: found.customer, engine: found.engine } });
      }
      return json(200, { match: null });
    }
    return json(400, { error: 'Unknown action' });
  }

  if (event.httpMethod === 'POST') {
    if (!canInput(user)) return json(403, { error: 'Forbidden' });
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }

    const data = await loadBalancing(store);

    if (body.action === 'create') {
      const before = clone(data);
      const entry = {
        id: 'b_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        dateAdded: nowISO(),
        jobNumber: body.jobNumber || '',
        customer: body.customer || '',
        engine: body.engine || '',
        balanceType: body.balanceType || '',
        pistonsBalanced: !!body.pistonsBalanced,
        rodsBalanced: !!body.rodsBalanced,
        flywheelFlexplateBalanced: !!body.flywheelFlexplateBalanced,
        balancerBalanced: !!body.balancerBalanced,
        raceBalance: !!body.raceBalance,
        extraHoursSurcharge: body.raceBalance ? (body.extraHoursSurcharge || '') : '',
        internalExternal: body.internalExternal || '',
        bobWeight: body.bobWeight || '',
        balanceFactor: body.balanceFactor || '',
        heavyMetal: !!body.heavyMetal,
        numberOfPlugsUsed: body.heavyMetal ? (body.numberOfPlugsUsed || '') : '',
        clutch: !!body.clutch,
        mirrorNeutralBalance: body.mirrorNeutralBalance || '',
        extraTimeSurcharge: body.extraTimeSurcharge || '',
        notes: body.notes || '',
        enteredBy: user.name,
      };

      data.entries.unshift(entry);
      await recordHistory(store, { key: 'balancing', before, description: `${user.name} added a Balancing entry for job ${entry.jobNumber || '(no #)'}`, userName: user.name, area: 'balancing' });
      await saveBalancing(store, data);

      // Same auto-note-linking behavior as Rottler: if this job number
      // matches an existing Build or Machining job, add a timestamped note
      // there with the balance job's details.
      if (body.linkedSheet && body.linkedJobId) {
        const sheetData = await loadSheet(store, body.linkedSheet);
        const job = sheetData.jobs.find((j) => j.id === body.linkedJobId);
        if (job) {
          job.notes.push({
            text: `Balancing recorded — ${balanceSummary(body)}${entry.notes ? ' — ' + entry.notes : ''}`,
            timestamp: nowISO(),
            author: user.name,
            auto: true,
          });
          await saveSheet(store, body.linkedSheet, sheetData);
        }
      }

      return json(200, { entry });
    }

    if (body.action === 'update') {
      const before = clone(data);
      const entry = data.entries.find((e) => e.id === body.entryId);
      if (!entry) return json(404, { error: 'Entry not found' });
      const patchable = [
        'jobNumber', 'customer', 'engine', 'balanceType',
        'pistonsBalanced', 'rodsBalanced', 'flywheelFlexplateBalanced', 'balancerBalanced',
        'raceBalance', 'extraHoursSurcharge', 'internalExternal', 'bobWeight', 'balanceFactor',
        'heavyMetal', 'numberOfPlugsUsed', 'clutch', 'mirrorNeutralBalance', 'extraTimeSurcharge', 'notes',
      ];
      for (const key of patchable) if (key in (body.patch || {})) entry[key] = body.patch[key];
      await recordHistory(store, { key: 'balancing', before, description: `${user.name} updated Balancing entry for job ${entry.jobNumber || '(no #)'}`, userName: user.name, area: 'balancing' });
      await saveBalancing(store, data);
      return json(200, { entry });
    }

    if (body.action === 'delete') {
      const before = clone(data);
      const idx = data.entries.findIndex((e) => e.id === body.entryId);
      if (idx === -1) return json(404, { error: 'Entry not found' });
      const [removed] = data.entries.splice(idx, 1);
      await recordHistory(store, { key: 'balancing', before, description: `${user.name} deleted Balancing entry for job ${removed.jobNumber || '(no #)'}`, userName: user.name, area: 'balancing' });
      await saveBalancing(store, data);
      return json(200, { removed, removedIndex: idx });
    }

    if (body.action === 'restore') {
      const before = clone(data);
      const entry = body.entry;
      if (!entry || !entry.id) return json(400, { error: 'entry required' });
      const idx = Math.min(Math.max(body.atIndex ?? data.entries.length, 0), data.entries.length);
      data.entries.splice(idx, 0, entry);
      await recordHistory(store, { key: 'balancing', before, description: `${user.name} restored (undo) Balancing entry for job ${entry.jobNumber || '(no #)'}`, userName: user.name, area: 'balancing' });
      await saveBalancing(store, data);
      return json(200, { entry });
    }

    return json(400, { error: 'Unknown action' });
  }

  return json(405, { error: 'Method not allowed' });
};
