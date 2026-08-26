// Lets each person customize the order their tabs appear in (sidebar on
// desktop, bottom bar + swipe-up sheet on phone). Pure display preference —
// does NOT affect what tabs they actually have access to; that's still
// entirely governed by the permission matrix (_permissions.js).
const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');

async function loadOrders(store) {
  const data = await store.get('tab-order', { type: 'json' });
  return data || {};
}
async function saveOrders(store, data) {
  await store.setJSON('tab-order', data);
}

// Merges a saved custom order with the current default tab list: anything
// the person saved an order for (and still has access to) comes first, in
// that order; anything new they've since gained access to (or never
// ordered) is appended at the end in its default order.
function mergeTabOrder(defaultTabs, savedOrder) {
  if (!savedOrder || !savedOrder.length) return defaultTabs;
  const validSaved = savedOrder.filter((id) => defaultTabs.includes(id));
  const remaining = defaultTabs.filter((id) => !validSaved.includes(id));
  return [...validSaved, ...remaining];
}

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session) return json(401, { error: 'Not logged in' });

  const store = getBlobStore('jobs');

  if (event.httpMethod === 'GET') {
    const orders = await loadOrders(store);
    const order = mergeTabOrder(session.user.tabs, orders[session.userId]);
    return json(200, { order });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }
    if (body.action !== 'set' || !Array.isArray(body.order)) return json(400, { error: 'order array required' });

    // Only ever save tab ids this user actually has access to right now.
    const order = body.order.filter((id) => session.user.tabs.includes(id));
    const orders = await loadOrders(store);
    orders[session.userId] = order;
    await saveOrders(store, orders);
    return json(200, { order: mergeTabOrder(session.user.tabs, order) });
  }

  return json(405, { error: 'Method not allowed' });
};

exports.mergeTabOrder = mergeTabOrder;
