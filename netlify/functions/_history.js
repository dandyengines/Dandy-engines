// Whole-blob "before" snapshot history, used for the admin-only revert
// system. Simpler than per-field diffs: every mutating action snapshots
// the entire blob (e.g. a person's whole sheet, or the whole Rottler
// directory) before the change is applied. Reverting an entry just writes
// that snapshot straight back. This is coarser than a per-field diff but
// far simpler and cheap enough for this team's usage volume, and it still
// gives a true "undo this action" experience since only one action
// typically touches a given blob between snapshots.

const RETENTION_DAYS = 60;

function nowISO() { return new Date().toISOString(); }

async function loadHistory(store) {
  const data = await store.get('history', { type: 'json' });
  return data || { entries: [] };
}
async function saveHistory(store, data) {
  await store.setJSON('history', data);
}

function pruneOld(entries) {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
}

// Call this BEFORE writing new data to `key`. `before` is the full old
// blob value (deep-cloned by the caller before mutating it in place).
async function recordHistory(store, { key, before, description, userName, area }) {
  const data = await loadHistory(store);
  data.entries = pruneOld(data.entries);
  data.entries.unshift({
    id: 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: nowISO(),
    key,
    before,
    description,
    userName,
    area,
  });
  await saveHistory(store, data);
}

async function listHistory(store) {
  const data = await loadHistory(store);
  const pruned = pruneOld(data.entries);
  if (pruned.length !== data.entries.length) {
    // opportunistic cleanup on read too, in addition to the nightly job
    data.entries = pruned;
    await saveHistory(store, data);
  }
  // Don't ship full "before" blobs to the list view — only on revert.
  return pruned.map(({ before, ...rest }) => rest);
}

async function revertHistory(store, historyId) {
  const data = await loadHistory(store);
  const entry = data.entries.find((e) => e.id === historyId);
  if (!entry) return { ok: false, error: 'History entry not found (may be older than 60 days)' };

  await store.setJSON(entry.key, entry.before);

  // Remove the reverted entry (and anything after it for the same key,
  // since those snapshots are now stale relative to the restored state).
  data.entries = data.entries.filter((e) => e.id !== entry.id);
  await saveHistory(store, data);

  return { ok: true, key: entry.key };
}

function clone(x) { return JSON.parse(JSON.stringify(x)); }

module.exports = { recordHistory, listHistory, revertHistory, clone, pruneOld, RETENTION_DAYS };
