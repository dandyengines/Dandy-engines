// Shared job-number autocomplete used by Part Payments (and reusable by
// Balancing later) — same search logic as Rottler's autocomplete, but not
// gated behind Rottler-specific permission, since Mel/Mike/Jake in Part
// Payments may not have Rottler access at all.
const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');

const BUILD_SHEET_IDS = ['jake', 'mike', 'frank', 'sab', 'lou'];
const MACHINING_SHEET_IDS = ['machining', 'machining_lou', 'machining_sab', 'machining_mike'];
const ALL_LINKABLE_SHEET_IDS = [...BUILD_SHEET_IDS, ...MACHINING_SHEET_IDS];

async function loadSheet(store, sheet) {
  const data = await store.get(`sheet:${sheet}`, { type: 'json' });
  return data || { jobs: [] };
}

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session) return json(401, { error: 'Not logged in' });

  const params = event.queryStringParameters || {};
  const q = (params.q || '').trim().toLowerCase();
  if (q.length < 1) return json(200, { suggestions: [] });

  const store = getBlobStore('jobs');
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
};
