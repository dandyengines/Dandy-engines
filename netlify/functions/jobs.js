const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');
const { recordHistory, clone } = require('./_history');
const { notifyUser } = require('./_push');
const { USERS } = require('./roles');
const { loadMatrix, getPerm } = require('./_permissions');

const SHEET_IDS = ['jake', 'mike', 'frank', 'sab', 'lou']; // the 5 actual job sheets

// Machining sheets: one private sheet per person, visible only to that
// person + the admin. 'machining' is Jake's own (unchanged storage key
// from the original single-sheet build); the rest are 'machining_<person>'.
const MACHINING_OWNERS = { machining: 'jake', machining_lou: 'lou', machining_sab: 'sab', machining_mike: 'mike' };
const MACHINING_SHEET_IDS = Object.keys(MACHINING_OWNERS);
function isMachiningSheet(sheet) { return sheet in MACHINING_OWNERS; }

// Maps a "sheet" key (as used throughout this file) to the permission-matrix
// tab id that governs it — Builds sheets are 'builds_<sheet>', Machining
// sheets already ARE the tab id (e.g. 'machining_lou').
function tabIdForSheet(sheet) { return isMachiningSheet(sheet) ? sheet : `builds_${sheet}`; }

// Access control now flows entirely through the live permission matrix
// (attached to `user.perms` by getSession) instead of the old hardcoded
// personSheet/viewSheets/editsOwnSheet checks — see _permissions.js.
function canView(user, sheet) { return user.perms[tabIdForSheet(sheet)] !== 'unseen'; }
function canEdit(user, sheet) { return user.perms[tabIdForSheet(sheet)] === 'edit'; }

// Notification targeting also goes through the live matrix now, so a
// permission Jake grants someone takes effect for notifications too.
async function usersOnSheet(store, sheet, exceptUserId) {
  const matrix = await loadMatrix(store);
  const tabId = tabIdForSheet(sheet);
  return Object.entries(USERS)
    .filter(([id, u]) => id !== exceptUserId && getPerm(matrix, id, tabId, u.role === 'admin') === 'edit')
    .map(([id]) => id);
}
async function usersViewingSheet(store, sheet, exceptUserId) {
  const matrix = await loadMatrix(store);
  const tabId = tabIdForSheet(sheet);
  return Object.entries(USERS)
    .filter(([id, u]) => id !== exceptUserId && getPerm(matrix, id, tabId, u.role === 'admin') !== 'unseen')
    .map(([id]) => id);
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

  const store = getBlobStore('jobs');
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

    if (params.action === 'allmachining') {
      // Same viewer list as All Builds (whoever can see alljobs sees this
      // too), but sourced from each person's Machining sheet instead.
      // Individual named Machining tabs stay locked to that person + admin;
      // this rollup is intentionally broader, mirroring All Builds exactly.
      if (!user.tabs.includes('allmachining')) return json(403, { error: 'Forbidden' });
      const result = {};
      for (const machSheet of MACHINING_SHEET_IDS) {
        const owner = MACHINING_OWNERS[machSheet];
        const data = await loadSheet(store, machSheet);
        const ordered = data.order
          .map((id) => data.jobs.find((j) => j.id === id))
          .filter(Boolean);
        const missing = data.jobs.filter((j) => !data.order.includes(j.id));
        result[owner] = [...ordered, ...missing].map((j) => ({ ...j, sheet: machSheet }));
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
        customerPhone: body.customerPhone || '',
        engine: body.engine || '',
        stage: body.stage || 'notstarted',
        urgent: false,
        expectedFinish: body.expectedFinish || null,
        invoiceNumber: '',
        dateAdded: nowISO(),
        personResponsible: isMachiningSheet(sheet) ? MACHINING_OWNERS[sheet] : sheet,
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

      // allowed fields to patch directly — core fields (job#/customer/engine)
      // are now editable post-creation, alongside stage/urgent/finish/etc.
      const patchable = ['jobNumber', 'customer', 'customerPhone', 'engine', 'stage', 'urgent', 'expectedFinish', 'invoiceNumber'];
      for (const key of patchable) {
        if (key in (body.patch || {})) job[key] = body.patch[key];
      }
      await recordHistory(store, { key: `sheet:${sheet}`, before, description: `${user.name} updated job ${job.jobNumber || '(no #)'} on ${sheet}'s sheet`, userName: user.name, area: 'myjobs' });
      await saveSheet(store, sheet, data);

      // Notifications: own-sheet change (other people editing "your" sheet),
      // and urgent-flag (opt-in, everyone with view access).
      const pushStore = getBlobStore('jobs');
      for (const uid of await usersOnSheet(pushStore, sheet, session.userId)) {
        notifyUser(pushStore, uid, 'ownSheetChange', {
          title: 'Dandy Engines', body: `${user.name} updated job ${job.jobNumber || '(no #)'} on your sheet.`,
        });
      }
      if (body.patch && body.patch.urgent === true) {
        for (const uid of await usersViewingSheet(pushStore, sheet, session.userId)) {
          notifyUser(pushStore, uid, 'urgentFlag', {
            title: '⚠ Urgent job', body: `Job ${job.jobNumber || '(no #)'} (${sheet}'s sheet) was flagged urgent.`,
          });
        }
      }

      return json(200, { job });
    }

    if (action === 'delete') {
      if (!canEdit(user, sheet)) return json(403, { error: 'Forbidden' });
      const data = await loadSheet(store, sheet);
      const before = clone(data);
      const idx = data.jobs.findIndex((j) => j.id === body.jobId);
      if (idx === -1) return json(404, { error: 'Job not found' });
      const [removed] = data.jobs.splice(idx, 1);
      data.order = data.order.filter((id) => id !== body.jobId);
      await recordHistory(store, { key: `sheet:${sheet}`, before, description: `${user.name} deleted job ${removed.jobNumber || '(no #)'} from ${sheet}'s sheet`, userName: user.name, area: 'myjobs' });
      await saveSheet(store, sheet, data);
      return json(200, { deletedJob: removed, deletedIndex: idx });
    }

    if (action === 'restore') {
      // Powers the Undo toast after a delete — reinserts the exact job
      // object at its original position.
      if (!canEdit(user, sheet)) return json(403, { error: 'Forbidden' });
      const data = await loadSheet(store, sheet);
      const before = clone(data);
      const job = body.job;
      if (!job || !job.id) return json(400, { error: 'job required' });
      const idx = Math.min(Math.max(body.atIndex ?? data.jobs.length, 0), data.jobs.length);
      data.jobs.splice(idx, 0, job);
      if (!data.order.includes(job.id)) data.order.push(job.id);
      await recordHistory(store, { key: `sheet:${sheet}`, before, description: `${user.name} restored (undo) job ${job.jobNumber || '(no #)'} on ${sheet}'s sheet`, userName: user.name, area: 'myjobs' });
      await saveSheet(store, sheet, data);
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
