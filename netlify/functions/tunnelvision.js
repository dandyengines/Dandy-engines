const { getStore } = require('@netlify/blobs');
const { getSession, json } = require('./_shared');
const { recordHistory, clone } = require('./_history');

const BLOCK_STATUSES = ['none', 'arrived', 'groutTaken', 'groutReturned', 'waitingparts', 'complete'];
const HEAD_STATUSES = ['none', 'arrived', 'waitingparts', 'complete'];
const RODS_STATUSES = ['none', 'arrived', 'complete'];
const CRANK_STATUSES = ['none', 'arrived', 'onrack', 'complete'];

const LABELS = {
  none: 'None', arrived: 'Arrived', groutTaken: 'Taken for Grout', groutReturned: 'Returned from Grout',
  waitingparts: 'Waiting for Parts', complete: 'Complete', onrack: 'On Rack',
};

function canAccess(user) {
  return user.tabs.includes('tunnelvision');
}

function nowISO() { return new Date().toISOString(); }

async function load(store) {
  const data = await store.get('tunnelvision', { type: 'json' });
  return data || { jobs: [], order: [] };
}
async function save(store, data) {
  await store.setJSON('tunnelvision', data);
}

function deriveBadge(job) {
  const statuses = [job.block.status, job.head.status, job.rods.status, job.crank.status];
  if (statuses.every((s) => s === 'complete')) return 'green';
  if (statuses.every((s) => s === 'none')) return 'grey';
  if (job.block.status === 'waitingparts' || job.head.status === 'waitingparts') return 'red';
  return 'blue';
}

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session || !canAccess(session.user)) return json(403, { error: 'Forbidden' });

  const store = getStore('jobs'); // shares the "jobs" store, different key
  const isAdmin = session.user.role === 'admin';

  if (event.httpMethod === 'GET') {
    const data = await load(store);
    const ordered = data.order.map((id) => data.jobs.find((j) => j.id === id)).filter(Boolean);
    return json(200, { jobs: ordered.map(withBadge), canEdit: isAdmin, statusOptions: { BLOCK_STATUSES, HEAD_STATUSES, RODS_STATUSES, CRANK_STATUSES, LABELS } });
  }

  if (event.httpMethod === 'POST') {
    if (!isAdmin) return json(403, { error: 'Forbidden' });
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }

    const data = await load(store);

    if (body.action === 'create') {
      const before = clone(data);
      const job = {
        id: 'tv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        tvNumber: body.tvNumber || '',
        customer: body.customer || '',
        engine: body.engine || '',
        block: { status: 'none' },
        head: { status: 'none' },
        rods: { status: 'none' },
        crank: { status: 'none' },
        value: body.value || 0,
        paid: 0,
        dateAdded: nowISO(),
        notes: [],
      };
      data.jobs.push(job);
      data.order.push(job.id);
      await recordHistory(store, { key: 'tunnelvision', before, description: `${session.user.name} created TV job ${job.tvNumber || '(no #)'}`, userName: session.user.name, area: 'tunnelvision' });
      await save(store, data);
      return json(200, { job: withBadge(job) });
    }

    if (body.action === 'updateComponent') {
      const before = clone(data);
      const job = data.jobs.find((j) => j.id === body.jobId);
      if (!job) return json(404, { error: 'Job not found' });
      const comp = body.component; // 'block' | 'head' | 'rods' | 'crank'
      if (!['block', 'head', 'rods', 'crank'].includes(comp)) return json(400, { error: 'Bad component' });

      const oldStatus = job[comp].status;
      job[comp].status = body.status;

      // Auto-timestamped note on every component status change
      if (oldStatus !== body.status) {
        job.notes.push({
          text: `${comp[0].toUpperCase() + comp.slice(1)}: ${LABELS[oldStatus] || oldStatus} → ${LABELS[body.status] || body.status}`,
          timestamp: nowISO(),
          author: session.user.name,
          auto: true,
        });
      }
      await recordHistory(store, { key: 'tunnelvision', before, description: `${session.user.name} changed ${comp} status on TV job ${job.tvNumber || '(no #)'}`, userName: session.user.name, area: 'tunnelvision' });
      await save(store, data);
      return json(200, { job: withBadge(job) });
    }

    if (body.action === 'updateFinance') {
      const before = clone(data);
      const job = data.jobs.find((j) => j.id === body.jobId);
      if (!job) return json(404, { error: 'Job not found' });
      if ('value' in body) job.value = Number(body.value) || 0;
      if ('paid' in body) job.paid = Number(body.paid) || 0;
      await recordHistory(store, { key: 'tunnelvision', before, description: `${session.user.name} updated $ value/paid on TV job ${job.tvNumber || '(no #)'}`, userName: session.user.name, area: 'tunnelvision' });
      await save(store, data);
      return json(200, { job: withBadge(job) });
    }

    if (body.action === 'addNote') {
      const before = clone(data);
      const job = data.jobs.find((j) => j.id === body.jobId);
      if (!job) return json(404, { error: 'Job not found' });
      job.notes.push({ text: body.text, timestamp: nowISO(), author: session.user.name });
      await recordHistory(store, { key: 'tunnelvision', before, description: `${session.user.name} added a note to TV job ${job.tvNumber || '(no #)'}`, userName: session.user.name, area: 'tunnelvision' });
      await save(store, data);
      return json(200, { job: withBadge(job) });
    }

    if (body.action === 'reorder') {
      const before = clone(data);
      const validIds = new Set(data.jobs.map((j) => j.id));
      const newOrder = (body.order || []).filter((id) => validIds.has(id));
      for (const j of data.jobs) if (!newOrder.includes(j.id)) newOrder.push(j.id);
      data.order = newOrder;
      await recordHistory(store, { key: 'tunnelvision', before, description: `${session.user.name} reordered Tunnel Vision`, userName: session.user.name, area: 'tunnelvision' });
      await save(store, data);
      return json(200, { order: data.order });
    }

    return json(400, { error: 'Unknown action' });
  }

  return json(405, { error: 'Method not allowed' });
};

function withBadge(job) {
  return { ...job, badge: deriveBadge(job) };
}
