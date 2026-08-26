// One-time admin cleanup: strips a trailing ".0" that Excel's float
// formatting left on job numbers and Tunnel Vision numbers during the
// original spreadsheet import (e.g. "40309.0" -> "40309"). Only ever
// removes a bare trailing ".0" — a real suffixed number like "34947.1"
// (used for redo/linked jobs) is left untouched. Safe to run more than
// once; anything already clean is simply skipped.
const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');

const SHEET_IDS = ['lou', 'frank', 'sab', 'mike', 'jake', 'machining'];
const DOT_ZERO = /^(\d+)\.0$/;

function fix(value) {
  if (typeof value !== 'string') return { value, changed: false };
  const m = DOT_ZERO.exec(value.trim());
  if (!m) return { value, changed: false };
  return { value: m[1], changed: true };
}

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session || session.user.role !== 'admin') return json(403, { error: 'Forbidden' });

  const store = getBlobStore('jobs');

  if (event.httpMethod === 'GET') {
    // Dry run: count how many values would change, without writing anything.
    const counts = {};
    let total = 0;

    for (const sheet of SHEET_IDS) {
      const data = await store.get(`sheet:${sheet}`, { type: 'json' });
      const n = (data?.jobs || []).filter((j) => fix(j.jobNumber).changed).length;
      if (n) counts[sheet] = n;
      total += n;
    }

    const tv = await store.get('tunnelvision', { type: 'json' });
    const tvCount = (tv?.jobs || []).filter((j) => fix(j.tvNumber).changed).length;
    if (tvCount) counts.tunnelvision = tvCount;
    total += tvCount;

    const rottler = await store.get('rottler', { type: 'json' });
    const rottlerCount = (rottler?.entries || []).filter((e) => fix(e.jobNumber).changed).length;
    if (rottlerCount) counts.rottler = rottlerCount;
    total += rottlerCount;

    return json(200, { total, counts });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }
    if (body.action !== 'run') return json(400, { error: 'Unknown action' });

    const results = {};
    let total = 0;

    for (const sheet of SHEET_IDS) {
      const data = await store.get(`sheet:${sheet}`, { type: 'json' });
      if (!data) continue;
      let n = 0;
      for (const j of data.jobs || []) {
        const { value, changed } = fix(j.jobNumber);
        if (changed) { j.jobNumber = value; n++; }
      }
      if (n) {
        await store.setJSON(`sheet:${sheet}`, data);
        results[sheet] = `cleaned ${n}`;
        total += n;
      }
    }

    const tv = await store.get('tunnelvision', { type: 'json' });
    if (tv) {
      let n = 0;
      for (const j of tv.jobs || []) {
        const { value, changed } = fix(j.tvNumber);
        if (changed) { j.tvNumber = value; n++; }
      }
      if (n) {
        await store.setJSON('tunnelvision', tv);
        results.tunnelvision = `cleaned ${n}`;
        total += n;
      }
    }

    const rottler = await store.get('rottler', { type: 'json' });
    if (rottler) {
      let n = 0;
      for (const e of rottler.entries || []) {
        const { value, changed } = fix(e.jobNumber);
        if (changed) { e.jobNumber = value; n++; }
      }
      if (n) {
        await store.setJSON('rottler', rottler);
        results.rottler = `cleaned ${n}`;
        total += n;
      }
    }

    return json(200, { total, results });
  }

  return json(405, { error: 'Method not allowed' });
};
