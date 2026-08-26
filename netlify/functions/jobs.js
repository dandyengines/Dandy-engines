const { getStore } = require('@netlify/blobs');
const { getSession, json } = require('./_shared');
const { recordHistory, clone } = require('./_history');
const { notifyUser } = require('./_push');
const { USERS } = require('./roles');

const SHEET_IDS = ['jake', 'mike', 'frank', 'sab', 'lou']; // the 5 actual job sheets

function usersOnSheet(sheet, exceptUserId) {
  return Object.entries(USERS)
    .filter(([id, u]) => u.personSheet === sheet && id !== exceptUserId)
    .map(([id]) => id);
}
function usersViewingSheet(sheet, exceptUserId) {
  return Object.entries(USERS)
    .filter(([id, u]) => (u.personSheet === sheet || u.viewSheets.includes(sheet)) && id !== exceptUserId)
    .map(([id]) => id);
}

function canView(user, sheet) {
  if (sheet === 'machining') return user.role === 'admin';
  return user.personSheet === sheet || user.viewSheets.includes(sheet);
}
function canEdit(user, sheet) {
  if (sheet === 'machining') return user.role === 'admin';
  return user.editsOwnSheet && user.personSheet === sheet;
}

async function loadSheet(store, sheet) {
  const data = await store.get(`sheet:${sheet}`, { type: 'json' });
  return data || { jobs: [], order: [] };
}
async function saveSheet(store, sheet, data) {
  await store.setJSON(`sheet:${sheet}`, data);
}

function nowISO() {
  return new Date().toISOString();
}

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session) return json(401, { error: 'Not logged in' });
  const { user } = session;

  const store = getStore('jobs');
  const params = event.queryStringParameters || {};

  // ---------- GET: read ----------
  if (event.httpMethod === 'GET') {
    if (params.action === 'alljobs') {
      // Read-only rollup: every sheet the user can view, in that sheet's
      // own custom order. Not editable, no independent ordering.
      const result = {};
      for (const sheet of SHEET_IDS) {
        if (!canView(user, sheet)) continue;
        const data = await loadSheet(store, sheet);
        const ordered = data.order
          .map((id) => data.jobs.find((j) => j.id === id))
          .filter(Boolean);
        // include any jobs missing from `order` (shouldn't happen, but safe)
        const missing = data.jobs.filter((j) => !data.order.includes(j.id));
        result[sheet] = [...ordered, ...missing].map((j) => ({ ...j, sheet }));
      }
      return json(200, result);
    }

    if (params.action === 'sheet') {
      const sheet = params.sheet;
      if (!sheet || !canView(user, sheet)) return json(403, { error: 'Forbidden' });
      const data = await loadSheet(store, sheet);
      return json(200, { ...data, canEdit: canEdit(user, sheet) });
    }

    return json(400, { error: 'Unknown action' });
  }

  // ---------- POST: write ----------
  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'Bad request' });
    }
    const { action, sheet } = body;
    if (!sheet) return json(400, { error: 'sheet required' });

    if (action === 'create') {
      if (!canEdit(user, sheet)) return json(403, { error: 'Forbidden' });
      const data = await loadSheet(store, sheet);
      const before = clone(data);
      const job = {
        id: 'j_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        jobNumber: body.jobNumber || '',
        customer: body.customer || '',
        engine: body.engine || '',
        stage: body.stage || 'notstarted',
        urgent: false,
        expectedFinish: body.expectedFinish || null,
        dateAdded: nowISO(),
        personResponsible: sheet,
        notes: body.notes ? [{ text: body.notes, timestamp: nowISO(), author: user.name }] : [],
        photos: [],
      };
      data.jobs.push(job);
      data.order.push(job.id);
      await recordHistory(store, { key: `sheet:${sheet}`, before, description: `${user.name} created job ${job.jobNumber || '(no #)'} on ${sheet}'s sheet`, userName: user.name, area: 'myjobs' });
      await saveSheet(store, sheet, data);
      return json(200, { job });
    }

    if (action === 'update') {
      if (!canEdit(user, sheet)) return json(403, { error: 'Forbidden' });
      const data = await loadSheet(store, sheet);
      const before = clone(data);
      const job = data.jobs.find((j) => j.id === body.jobId);
      if (!job) return json(404, { error: 'Job not found' });

      // allowed fields to patch directly
      const patchable = ['jobNumber', 'customer', 'engine', 'stage', 'urgent', 'expectedFinish'];
      for (const key of patchable) {
        if (key in (body.patch || {})) job[key] = body.patch[key];
      }
      await recordHistory(store, { key: `sheet:${sheet}`, before, description: `${user.name} updated job ${job.jobNumber || '(no #)'} on ${sheet}'s sheet`, userName: user.name, area: 'myjobs' });
      await saveSheet(store, sheet, data);

      // Notifications: own-sheet change (other people editing "your" sheet),
      // and urgent-flag (opt-in, everyone with view access).
      const pushStore = getStore('jobs');
      for (const uid of usersOnSheet(sheet, session.userId)) {
        notifyUser(pushStore, uid, 'ownSheetChange', {
          title: 'Dandy Engines', body: `${user.name} updated job ${job.jobNumber || '(no #)'} on your sheet.`,
        });
      }
      if (body.patch && body.patch.urgent === true) {
        for (const uid of usersViewingSheet(sheet, session.userId)) {
          notifyUser(pushStore, uid, 'urgentFlag', {
            title: '⚠ Urgent job', body: `Job ${job.jobNumber || '(no #)'} (${sheet}'s sheet) was flagged urgent.`,
          });
        }
      }

      return json(200, { job });
    }

    if (action === 'addNote') {
      if (!canEdit(user, sheet)) return json(403, { error: 'Forbidden' });
      const data = await loadSheet(store, sheet);
      const before = clone(data);
      const job = data.jobs.find((j) => j.id === body.jobId);
      if (!job) return json(404, { error: 'Job not found' });
      job.notes.push({ text: body.text, timestamp: nowISO(), author: user.name });
      await recordHistory(store, { key: `sheet:${sheet}`, before, description: `${user.name} added a note to job ${job.jobNumber || '(no #)'} on ${sheet}'s sheet`, userName: user.name, area: 'myjobs' });
      await saveSheet(store, sheet, data);
      return json(200, { job });
    }

    if (action === 'reorder') {
      if (!canEdit(user, sheet)) return json(403, { error: 'Forbidden' });
      const data = await loadSheet(store, sheet);
      const before = clone(data);
      const validIds = new Set(data.jobs.map((j) => j.id));
      const newOrder = (body.order || []).filter((id) => validIds.has(id));
      // append anything missing so nothing silently disappears
      for (const j of data.jobs) if (!newOrder.includes(j.id)) newOrder.push(j.id);
      data.order = newOrder;
      await recordHistory(store, { key: `sheet:${sheet}`, before, description: `${user.name} reordered ${sheet}'s sheet`, userName: user.name, area: 'myjobs' });
      await saveSheet(store, sheet, data);
      return json(200, { order: data.order });
    }

    return json(400, { error: 'Unknown action' });
  }

  return json(405, { error: 'Method not allowed' });
};
