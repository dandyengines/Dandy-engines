// Master search: searches job#, customer, and engine across everything the
// logged-in user has view access to — Builds, Machining, Rottler, Tunnel
// Vision — and returns a flat list of matches for the header search bubble.
const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');

const BUILD_SHEET_IDS = ['jake', 'mike', 'frank', 'sab', 'lou'];
const MACHINING_OWNERS = { machining: 'jake', machining_lou: 'lou', machining_sab: 'sab', machining_mike: 'mike' };

function canViewBuild(user, sheet) {
  return user.personSheet === sheet || (user.viewSheets || []).includes(sheet);
}
function canViewMachining(user, sheet) {
  return user.role === 'admin' || user.personSheet === MACHINING_OWNERS[sheet];
}

async function loadSheet(store, key) {
  const data = await store.get(`sheet:${key}`, { type: 'json' });
  return data || { jobs: [] };
}

function matches(q, ...fields) {
  return fields.some((f) => (f || '').toString().toLowerCase().includes(q));
}

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session) return json(401, { error: 'Not logged in' });
  const { user } = session;

  const params = event.queryStringParameters || {};
  const q = (params.q || '').trim().toLowerCase();
  if (q.length < 2) return json(200, { results: [] });

  const store = getBlobStore('jobs');
  const results = [];

  // Builds
  for (const sheet of BUILD_SHEET_IDS) {
    if (!canViewBuild(user, sheet)) continue;
    const data = await loadSheet(store, sheet);
    for (const j of data.jobs || []) {
      if (matches(q, j.jobNumber, j.customer, j.engine)) {
        results.push({ type: 'builds', tabId: `builds_${sheet}`, label: `${j.jobNumber || '—'} — ${j.customer || ''} (${sheet}'s Builds)` });
      }
    }
  }

  // Machining — same "who can see it" rule as the All Machining rollup:
  // anyone with allmachining sees results from every machining sheet, not
  // just their own (individual Machining tabs stay separately gated).
  if (user.tabs.includes('allmachining')) {
    for (const machSheet of Object.keys(MACHINING_OWNERS)) {
      const data = await loadSheet(store, machSheet);
      for (const j of data.jobs || []) {
        if (matches(q, j.jobNumber, j.customer, j.engine)) {
          const owner = MACHINING_OWNERS[machSheet];
          // Route to the individual tab only if this user can actually open
          // it; everyone else with the broader rollup permission lands on
          // All Machining instead, where they can actually see the result.
          const tabId = canViewMachining(user, machSheet) ? machSheet : 'allmachining';
          results.push({ type: 'machining', tabId, label: `${j.jobNumber || '—'} — ${j.customer || ''} (${owner}'s Machining)` });
        }
      }
    }
  }

  // Rottler
  if (user.rottler) {
    const rottler = await store.get('rottler', { type: 'json' });
    for (const e of (rottler?.entries || [])) {
      if (matches(q, e.jobNumber, e.customer, e.engine)) {
        results.push({ type: 'rottler', tabId: 'rottler', label: `${e.jobNumber || '—'} — ${e.customer || ''} (Rottler)` });
      }
    }
  }

  // Tunnel Vision
  if (user.tabs.includes('tunnelvision')) {
    const tv = await store.get('tunnelvision', { type: 'json' });
    for (const j of (tv?.jobs || [])) {
      if (matches(q, j.tvNumber, j.customer, j.engine)) {
        results.push({ type: 'tunnelvision', tabId: 'tunnelvision', label: `${j.tvNumber || '—'} — ${j.customer || ''} (Tunnel Vision)` });
      }
    }
  }

  // Balancing (once the sheet exists — safe no-op until then)
  if (user.tabs.includes('balancing')) {
    const balancing = await store.get('balancing', { type: 'json' });
    for (const j of (balancing?.entries || [])) {
      if (matches(q, j.jobNumber, j.customer, j.engine)) {
        results.push({ type: 'balancing', tabId: 'balancing', label: `${j.jobNumber || '—'} — ${j.customer || ''} (Balancing)` });
      }
    }
  }

  return json(200, { results: results.slice(0, 40) });
};
