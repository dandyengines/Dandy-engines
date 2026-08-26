// Reusable "legacy upload portal" — an ongoing version of the one-off
// import-legacy.js tool. Accepts an uploaded Jobs or Rottler spreadsheet
// (matching the templates in /templates), parses it server-side with
// SheetJS, and imports only genuinely NEW job numbers — anything already
// in the app is left completely untouched, even if the spreadsheet has
// different/newer data for that row (the app is the source of truth once
// a job exists there).
const XLSX = require('xlsx');
const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');

// Row layout is fixed by the templates in /public/templates: title (row 1),
// instructions (row 2), blank (row 3), header (row 4), field descriptions
// (row 5), a greyed example row (row 6), real data from row 7 on.
const HEADER_ROW = 4;
const DATA_START_ROW = 7;

// Known example-row values from the templates — skipped even if the user
// forgets to delete the grey example row before uploading.
const EXAMPLE_JOB_NUMBER = '40309';
const EXAMPLE_CUSTOMER = 'J. Smith';

const JOBS_SHEET_KEYS = {
  Lou: 'lou', Frank: 'frank', Sab: 'sab', Mike: 'mike', Jake: 'jake',
  'Lou Machining': 'machining_lou', 'Sab Machining': 'machining_sab',
  'Mike Machining': 'machining_mike', 'Jake Machining': 'machining',
};

const STATUS_LABEL_TO_ID = {
  'not started': 'notstarted',
  'stripped/assessment': 'stripped', 'stripped / assessment': 'stripped', 'stripped-assessment': 'stripped',
  'waiting on parts': 'waitingparts',
  'machining': 'machining',
  'awaiting dummy assembly': 'dummyassembly',
  'ready for assembly': 'readyforassembly',
  'assembling': 'assembling',
  'ready for dyno': 'readyfordyno',
  'ready/assembling/dyno': 'readyforassembly', 'ready / assembling / dyno': 'readyforassembly',
  'awaiting payment': 'awaitingpayment',
  'on hold': 'onhold',
  'complete': 'complete',
};

function nowISO() { return new Date().toISOString(); }

function rowsFromSheet(worksheet) {
  const grid = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  return grid.slice(DATA_START_ROW - 1); // 0-indexed
}

function cellStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function excelDateToISO(v) {
  if (!v && v !== 0) return null;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y.toString().padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = cellStr(v);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

async function loadSheet(store, sheet) {
  const data = await store.get(`sheet:${sheet}`, { type: 'json' });
  return data || { jobs: [], order: [] };
}
async function saveSheet(store, sheet, data) { await store.setJSON(`sheet:${sheet}`, data); }
async function loadRottler(store) {
  const data = await store.get('rottler', { type: 'json' });
  return data || { entries: [] };
}
async function saveRottler(store, data) { await store.setJSON('rottler', data); }

function isExampleJobsRow(row) {
  return cellStr(row[0]) === EXAMPLE_JOB_NUMBER && cellStr(row[1]) === EXAMPLE_CUSTOMER;
}

function importJobsWorkbook(workbook) {
  const bySheet = {};
  for (const [templateName, sheetKey] of Object.entries(JOBS_SHEET_KEYS)) {
    const ws = workbook.Sheets[templateName];
    if (!ws) continue;
    const rows = rowsFromSheet(ws).filter((r) => r.some((c) => cellStr(c)));
    const jobs = [];
    for (const row of rows) {
      if (isExampleJobsRow(row)) continue;
      const jobNumber = cellStr(row[0]);
      if (!jobNumber) continue;
      const statusLabel = cellStr(row[6]).toLowerCase();
      jobs.push({
        jobNumber,
        customer: cellStr(row[1]),
        customerPhone: cellStr(row[2]),
        engine: cellStr(row[3]),
        dateAddedRaw: row[4],
        expectedFinishRaw: row[5],
        stage: STATUS_LABEL_TO_ID[statusLabel] || 'notstarted',
        urgent: /^y/i.test(cellStr(row[7])),
        notesText: cellStr(row[8]),
      });
    }
    bySheet[sheetKey] = jobs;
  }
  return bySheet;
}

function importRottlerWorkbook(workbook) {
  const ws = workbook.Sheets['Rottler DATA'];
  if (!ws) return [];
  const rows = rowsFromSheet(ws).filter((r) => r.some((c) => cellStr(c)));
  const entries = [];
  for (const row of rows) {
    if (isExampleJobsRow(row)) continue;
    const jobNumber = cellStr(row[0]);
    if (!jobNumber) continue;
    const pistonOD = parseFloat(row[4]);
    const boreSize = parseFloat(row[3]);
    const clearance = (!isNaN(pistonOD) && !isNaN(boreSize)) ? +(boreSize - pistonOD).toFixed(4) : null;
    const raceHoneOn = /^y/i.test(cellStr(row[7]));
    entries.push({
      jobNumber,
      customer: cellStr(row[1]),
      engine: cellStr(row[2]),
      boreSize: isNaN(boreSize) ? null : boreSize,
      pistonOD: isNaN(pistonOD) ? null : pistonOD,
      clearance,
      torquePlate: /^y/i.test(cellStr(row[5])) ? { on: true, value: cellStr(row[6]) } : { on: false, value: '' },
      raceHone: raceHoneOn
        ? { on: true, rpk: cellStr(row[8]), rk: cellStr(row[9]), rvk: cellStr(row[10]), angle: cellStr(row[11]), stonesUsed: cellStr(row[12]) }
        : { on: false },
      dateAddedRaw: row[13],
      value: parseFloat(row[14]) || 0,
      paid: parseFloat(row[15]) || 0,
      notesText: cellStr(row[16]),
    });
  }
  return entries;
}

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session || session.user.role !== 'admin') return json(403, { error: 'Forbidden' });

  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }
  const { type, fileBase64 } = body;
  if (!fileBase64 || !['jobs', 'rottler'].includes(type)) return json(400, { error: 'type and fileBase64 required' });

  let workbook;
  try {
    const buf = Buffer.from(fileBase64, 'base64');
    workbook = XLSX.read(buf, { type: 'buffer' });
  } catch (e) {
    return json(400, { error: "Couldn't read that file — is it a valid .xlsx?" });
  }

  const store = getBlobStore('jobs');
  const results = {};

  if (type === 'jobs') {
    const bySheet = importJobsWorkbook(workbook);
    for (const [sheetKey, rows] of Object.entries(bySheet)) {
      const data = await loadSheet(store, sheetKey);
      const existingNumbers = new Set(data.jobs.map((j) => (j.jobNumber || '').trim().toLowerCase()));
      let added = 0;
      for (const row of rows) {
        if (existingNumbers.has(row.jobNumber.trim().toLowerCase())) continue;
        const job = {
          id: 'j_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          jobNumber: row.jobNumber,
          customer: row.customer,
          customerPhone: row.customerPhone,
          engine: row.engine,
          stage: row.stage,
          urgent: row.urgent,
          expectedFinish: excelDateToISO(row.expectedFinishRaw),
          invoiceNumber: '',
          dateAdded: excelDateToISO(row.dateAddedRaw) || nowISO(),
          personResponsible: sheetKey.startsWith('machining') ? (sheetKey === 'machining' ? 'jake' : sheetKey.slice('machining_'.length)) : sheetKey,
          notes: row.notesText ? [{ text: row.notesText, timestamp: nowISO(), author: 'Legacy Upload', auto: true }] : [],
          photos: [],
        };
        data.jobs.push(job);
        data.order.push(job.id);
        existingNumbers.add(row.jobNumber.trim().toLowerCase());
        added++;
      }
      if (added > 0) await saveSheet(store, sheetKey, data);
      results[sheetKey] = `${added} new job(s) added (${rows.length - added} skipped — already existed)`;
    }
  } else {
    const rows = importRottlerWorkbook(workbook);
    const data = await loadRottler(store);
    const existingNumbers = new Set(data.entries.map((e) => (e.jobNumber || '').trim().toLowerCase()));
    let added = 0;
    for (const row of rows) {
      if (existingNumbers.has(row.jobNumber.trim().toLowerCase())) continue;
      data.entries.unshift({
        id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        personResponsible: 'jake',
        dateAdded: excelDateToISO(row.dateAddedRaw) || nowISO(),
        jobNumber: row.jobNumber,
        customer: row.customer,
        engine: row.engine,
        pistonOD: row.pistonOD,
        boreSize: row.boreSize,
        clearance: row.clearance,
        torquePlate: row.torquePlate,
        raceHone: row.raceHone,
        notes: row.notesText,
        redoOf: null,
        enteredBy: 'Legacy Upload',
      });
      existingNumbers.add(row.jobNumber.trim().toLowerCase());
      added++;
    }
    if (added > 0) await saveRottler(store, data);
    results.rottler = `${added} new entr${added === 1 ? 'y' : 'ies'} added (${rows.length - added} skipped — already existed)`;
  }

  return json(200, { results });
};
