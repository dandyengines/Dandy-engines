// Shared roles & permissions config for Dandy Engines.
// Passwords are read from environment variables first (Site settings -> Environment
// variables in Netlify), falling back to the defaults below only if not set.
// See README.md for how to set these in production.

function pw(envName, fallback) {
  return process.env[envName] || fallback;
}

// personSheet: which "person" job-status sheet this user edits (null = none of their own)
// editsOwnSheet: can freely edit personSheet
// viewSheets: array of person-sheet keys this user can view (read-only) in addition to their own
// rottler: 'input' | 'edit' | 'review' | 'view' | null
// tabs: which top-level tabs this user sees
const USERS = {
  jake: {
    name: 'Jake',
    password: pw('JAKE_PASSWORD', 'jakedm'),
    role: 'admin',
    personSheet: 'jake',
    editsOwnSheet: true,
    viewSheets: ['mike', 'frank', 'sab', 'lou'],
    rottler: 'edit',
    // Jake (admin) sees and can edit every Machining tab — his own plus
    // everyone else's — in addition to all his other tabs.
    tabs: ['home', 'myjobs', 'alljobs', 'allmachining', 'rottler', 'tunnelvision', 'machining', 'machining_lou', 'machining_sab', 'machining_mike', 'balancing', 'partpayments', 'settings', 'history'],
  },
  mike: {
    name: 'Mike',
    password: pw('MIKE_PASSWORD', 'mikei'),
    role: 'staff',
    personSheet: 'mike',
    editsOwnSheet: true,
    viewSheets: ['jake', 'frank', 'sab', 'lou'],
    rottler: 'edit',
    tabs: ['home', 'myjobs', 'alljobs', 'allmachining', 'rottler', 'machining_mike', 'partpayments', 'settings'],
  },
  frank: {
    name: 'Frank',
    password: pw('FRANK_PASSWORD', 'frankm'),
    role: 'staff',
    personSheet: 'frank',
    editsOwnSheet: true,
    viewSheets: ['jake', 'mike', 'sab', 'lou'],
    rottler: 'view',
    tabs: ['home', 'myjobs', 'alljobs', 'allmachining', 'rottler', 'settings'],
  },
  sab: {
    name: 'Sab',
    password: pw('SAB_PASSWORD', 'sabm'),
    role: 'staff',
    personSheet: 'sab',
    editsOwnSheet: true,
    viewSheets: ['jake', 'frank', 'lou', 'mike'],
    rottler: 'view',
    tabs: ['home', 'myjobs', 'alljobs', 'allmachining', 'rottler', 'machining_sab', 'settings'],
  },
  lou: {
    name: 'Lou',
    password: pw('LOU_PASSWORD', 'loui'),
    role: 'staff',
    personSheet: 'lou',
    editsOwnSheet: true,
    viewSheets: ['jake', 'frank', 'sab', 'mike'],
    rottler: 'view',
    tabs: ['home', 'myjobs', 'alljobs', 'allmachining', 'rottler', 'machining_lou', 'settings'],
  },
  dean: {
    name: 'Dean',
    password: pw('DEAN_PASSWORD', 'deans'),
    role: 'staff',
    personSheet: 'lou', // Dean edits Lou's sheet
    editsOwnSheet: true,
    viewSheets: ['jake', 'frank', 'sab', 'mike'],
    rottler: 'view',
    tabs: ['home', 'myjobs', 'alljobs', 'allmachining', 'rottler', 'settings'],
  },
  ulrich: {
    name: 'Ulrich',
    password: pw('ULRICH_PASSWORD', 'ulrichb'),
    role: 'staff',
    personSheet: 'frank', // Ulrich edits Frank's sheet
    editsOwnSheet: true,
    viewSheets: ['jake', 'lou', 'sab', 'mike'],
    rottler: 'view',
    tabs: ['home', 'myjobs', 'alljobs', 'allmachining', 'rottler', 'settings'],
  },
  gus: {
    name: 'Gus',
    password: pw('GUS_PASSWORD', 'gustavom'),
    role: 'staff',
    personSheet: 'lou', // Gus edits Lou's sheet
    editsOwnSheet: true,
    viewSheets: ['jake', 'frank', 'mike', 'sab'],
    rottler: 'input', // full edit + the "New Job" input form
    tabs: ['home', 'myjobs', 'alljobs', 'allmachining', 'rottler', 'settings'],
  },
  josh: {
    name: 'Josh',
    password: pw('JOSH_PASSWORD', 'joshm'),
    role: 'staff',
    personSheet: null,
    editsOwnSheet: false,
    viewSheets: [],
    rottler: null,
    balancing: 'input', // same pattern as gus.rottler = 'input': full edit + the "New Job" input form
    tabs: ['home', 'balancing', 'alljobs', 'allmachining', 'settings'],
  },
  mel: {
    name: 'Mel',
    password: pw('MEL_PASSWORD', 'melissa'),
    role: 'partpayments-only',
    personSheet: null,
    editsOwnSheet: false,
    viewSheets: [], // Mel doesn't get per-person sheets, only the master list
    rottler: null,
    tabs: ['partpayments', 'alljobs', 'allmachining', 'settings'],
  },
  nathaniel: {
    name: 'Nathaniel',
    password: pw('NATHANIEL_PASSWORD', 'Nathaniel'),
    role: 'guest',
    personSheet: null,
    editsOwnSheet: false,
    // Guest: view-only across every person sheet + master list + Rottler.
    // No Tunnel Vision, Part Payments, or Machining.
    viewSheets: ['jake', 'mike', 'frank', 'sab', 'lou'],
    rottler: 'view',
    tabs: ['home', 'alljobs', 'allmachining', 'rottler', 'settings'],
  },
};

// Everyone who can be assigned as "person responsible" on a job
const RESPONSIBLE_PEOPLE = ['jake', 'mike', 'lou', 'sab', 'frank'];

module.exports = { USERS, RESPONSIBLE_PEOPLE };
