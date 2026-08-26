// Central permission matrix: { [userId]: { [tabId]: 'view' | 'edit' | 'unseen' } }
// This is now the SOURCE OF TRUTH for access control across the whole app.
// It's seeded once from the identity fields in roles.js (personSheet,
// viewSheets, editsOwnSheet, rottler, balancing, tabs) so behavior doesn't
// change on first deploy, but from then on Jake can freely edit it from
// Settings -> Manage Team Permissions without any code changes — including
// promoting a staff member to effectively-admin on any tab (e.g. granting
// 'edit' on "settings" unlocks the same admin tools Jake has there).
//
// roles.js's identity fields (personSheet, viewSheets, editsOwnSheet, etc.)
// still exist and still mean "whose sheet is this by default" — used for
// things like notification targeting and dropdown defaults — but they no
// longer gate access on their own. Only the matrix does that now.
const { USERS } = require('./roles');

const TAB_DEFS = [
  { id: 'home', label: 'Home' },
  { id: 'builds_jake', label: "Jake's Builds" },
  { id: 'builds_mike', label: "Mike's Builds" },
  { id: 'builds_frank', label: "Frank's Builds" },
  { id: 'builds_sab', label: "Sab's Builds" },
  { id: 'builds_lou', label: "Lou's Builds" },
  { id: 'alljobs', label: 'All Builds' },
  { id: 'machining', label: "Jake's Machining" },
  { id: 'machining_lou', label: "Lou's Machining" },
  { id: 'machining_sab', label: "Sab's Machining" },
  { id: 'machining_mike', label: "Mike's Machining" },
  { id: 'allmachining', label: 'All Machining' },
  { id: 'rottler', label: 'Rottler' },
  { id: 'balancing', label: 'Balancing' },
  { id: 'tunnelvision', label: 'Tunnel Vision' },
  { id: 'partpayments', label: 'Part Payments' },
  { id: 'settings', label: 'Settings' },
  { id: 'history', label: 'History' },
];
const TAB_IDS = TAB_DEFS.map((t) => t.id);

const MACHINING_OWNERS = { machining: 'jake', machining_lou: 'lou', machining_sab: 'sab', machining_mike: 'mike' };

function computeDefaultMatrix() {
  const matrix = {};
  for (const [userId, u] of Object.entries(USERS)) {
    const row = {};

    row.home = u.tabs.includes('home') ? 'view' : 'unseen';

    for (const person of ['jake', 'mike', 'frank', 'sab', 'lou']) {
      if (u.editsOwnSheet && u.personSheet === person) row['builds_' + person] = 'edit';
      else if ((u.viewSheets || []).includes(person)) row['builds_' + person] = 'view';
      else row['builds_' + person] = 'unseen';
    }

    row.alljobs = u.tabs.includes('alljobs') ? 'view' : 'unseen';
    row.allmachining = u.tabs.includes('allmachining') ? 'view' : 'unseen';

    for (const machSheet of Object.keys(MACHINING_OWNERS)) {
      row[machSheet] = u.tabs.includes(machSheet) ? 'edit' : 'unseen';
    }

    if (u.rottler === 'edit' || u.rottler === 'input') row.rottler = 'edit';
    else if (u.rottler === 'view' || u.rottler === 'review') row.rottler = 'view';
    else row.rottler = 'unseen';

    if (u.role === 'admin' || u.balancing === 'input') row.balancing = 'edit';
    else if (u.tabs.includes('balancing')) row.balancing = 'view';
    else row.balancing = 'unseen';

    row.tunnelvision = u.tabs.includes('tunnelvision') ? 'edit' : 'unseen';
    row.partpayments = u.tabs.includes('partpayments') ? 'edit' : 'unseen';
    row.settings = u.tabs.includes('settings') ? 'view' : 'unseen';
    row.history = u.tabs.includes('history') ? 'edit' : 'unseen';

    matrix[userId] = row;
  }
  return matrix;
}

async function loadMatrix(store) {
  const data = await store.get('permissions', { type: 'json' });
  if (data && data.matrix) return data.matrix;
  const seeded = computeDefaultMatrix();
  await store.setJSON('permissions', { matrix: seeded });
  return seeded;
}

async function saveMatrix(store, matrix) {
  await store.setJSON('permissions', { matrix });
}

// Jake (the identity role:'admin' account) is always a full bypass — this
// is the safety net that means no permission-matrix mistake can ever lock
// the actual admin account out of the app.
function getPerm(matrix, userId, tabId, isSuperAdmin) {
  if (isSuperAdmin) return 'edit';
  return (matrix[userId] && matrix[userId][tabId]) || 'unseen';
}

module.exports = { TAB_DEFS, TAB_IDS, MACHINING_OWNERS, computeDefaultMatrix, loadMatrix, saveMatrix, getPerm };
