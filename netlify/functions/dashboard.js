// Powers the Home dashboard: personal "what's on my plate" stats (from the
// user's own Builds sheet + their own private Machining sheet, if any),
// plus shop-wide tiles that are visible more broadly.
const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');

const BUILD_SHEET_IDS = ['jake', 'mike', 'frank', 'sab', 'lou'];
const MACHINING_OWNERS = { machining: 'jake', machining_lou: 'lou', machining_sab: 'sab', machining_mike: 'mike' };

async function loadSheet(store, key) {
  const data = await store.get(`sheet:${key}`, { type: 'json' });
  return (data && data.jobs) ? data.jobs : [];
}

function isOverdue(job) {
  if (!job.expectedFinish || job.stage === 'complete') return false;
  return new Date(job.expectedFinish) < new Date(new Date().toDateString());
}

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session) return json(401, { error: 'Not logged in' });
  const { user } = session;

  const store = getBlobStore('jobs');
  const result = {};

  // ---------- Personal: "what's on my plate" ----------
  if (user.personSheet) {
    const ownMachSheet = Object.keys(MACHINING_OWNERS).find((k) => MACHINING_OWNERS[k] === user.personSheet);
    const jobs = [
      ...(await loadSheet(store, user.personSheet)),
      ...(ownMachSheet ? await loadSheet(store, ownMachSheet) : []),
    ];
    const active = jobs.filter((j) => j.stage !== 'complete');
    const urgentJobs = active.filter((j) => j.urgent);
    const overdueJobs = active.filter((j) => isOverdue(j));
    const onHoldJobs = active.filter((j) => j.stage === 'onhold');
    const approachingDeadlines = active
      .filter((j) => j.expectedFinish)
      .sort((a, b) => new Date(a.expectedFinish) - new Date(b.expectedFinish))
      .slice(0, 5);

    result.personal = {
      activeCount: active.length,
      urgentCount: urgentJobs.length,
      overdueCount: overdueJobs.length,
      onHoldCount: onHoldJobs.length,
      approachingDeadlines,
      urgentJobs: urgentJobs.slice(0, 5),
      homeTab: `builds_${user.personSheet}`,
    };
  } else {
    result.personal = null;
  }

  // ---------- Shop-wide: total active Builds (everyone sees this) ----------
  let shopWideActiveBuilds = 0;
  for (const sheet of BUILD_SHEET_IDS) {
    const jobs = await loadSheet(store, sheet);
    shopWideActiveBuilds += jobs.filter((j) => j.stage !== 'complete').length;
  }
  result.shopWideActiveBuilds = shopWideActiveBuilds;

  // ---------- Shop-wide: total active Machining (Jake + Mike only) ----------
  if (user.role === 'admin' || session.userId === 'mike') {
    let total = 0;
    for (const machSheet of Object.keys(MACHINING_OWNERS)) {
      const jobs = await loadSheet(store, machSheet);
      total += jobs.filter((j) => j.stage !== 'complete').length;
    }
    result.shopWideMachiningTotal = total;
  } else {
    result.shopWideMachiningTotal = null;
  }

  // ---------- Invoices Awaiting Payment ----------
  const isShopWideViewer = user.role === 'admin' || session.userId === 'mike' || session.userId === 'mel';
  if (isShopWideViewer) {
    let total = 0;
    for (const sheet of BUILD_SHEET_IDS) {
      total += (await loadSheet(store, sheet)).filter((j) => j.stage === 'awaitingpayment').length;
    }
    for (const machSheet of Object.keys(MACHINING_OWNERS)) {
      total += (await loadSheet(store, machSheet)).filter((j) => j.stage === 'awaitingpayment').length;
    }
    result.invoicesAwaitingPayment = { scope: 'shopwide', count: total };
  } else if (user.personSheet) {
    const ownMachSheet = Object.keys(MACHINING_OWNERS).find((k) => MACHINING_OWNERS[k] === user.personSheet);
    const jobs = [
      ...(await loadSheet(store, user.personSheet)),
      ...(ownMachSheet ? await loadSheet(store, ownMachSheet) : []),
    ];
    result.invoicesAwaitingPayment = { scope: 'personal', count: jobs.filter((j) => j.stage === 'awaitingpayment').length };
  } else {
    result.invoicesAwaitingPayment = null;
  }

  return json(200, result);
};
