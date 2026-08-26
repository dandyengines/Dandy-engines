// Powers the Home dashboard: personal "what's on my plate" stats (own
// Builds sheet + own private Machining sheet, if any), plus shop-wide
// tiles, and the "Invoices Awaiting Payment" job list.
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

function ownMachiningSheetFor(personSheet) {
  return Object.keys(MACHINING_OWNERS).find((k) => MACHINING_OWNERS[k] === personSheet) || null;
}

// Tags each job with the tab id it should navigate to, so a mixed
// Builds+Machining list (approaching deadlines, urgent jobs, awaiting
// payment) can route each row to the correct place.
async function taggedJobs(store, sheet, tabId) {
  return (await loadSheet(store, sheet)).map((j) => ({ ...j, tabId }));
}

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session) return json(401, { error: 'Not logged in' });
  const { user } = session;
  const store = getBlobStore('jobs');
  const params = (event.queryStringParameters || {});

  // ---------- Invoices Awaiting Payment — the actual job list ----------
  if (params.action === 'awaitingpayment') {
    const isShopWideViewer = user.role === 'admin' || session.userId === 'mike' || session.userId === 'mel';
    let jobs = [];
    if (isShopWideViewer) {
      for (const sheet of BUILD_SHEET_IDS) jobs.push(...(await taggedJobs(store, sheet, `builds_${sheet}`)));
      for (const machSheet of Object.keys(MACHINING_OWNERS)) jobs.push(...(await taggedJobs(store, machSheet, machSheet)));
    } else if (user.personSheet) {
      jobs.push(...(await taggedJobs(store, user.personSheet, `builds_${user.personSheet}`)));
      const ownMach = ownMachiningSheetFor(user.personSheet);
      if (ownMach) jobs.push(...(await taggedJobs(store, ownMach, ownMach)));
    }
    jobs = jobs.filter((j) => j.stage === 'awaitingpayment');
    return json(200, { jobs, scope: isShopWideViewer ? 'shopwide' : 'personal' });
  }

  const result = {};

  // ---------- Personal: "what's on my plate" ----------
  if (user.personSheet) {
    const buildsTab = `builds_${user.personSheet}`;
    const ownMach = ownMachiningSheetFor(user.personSheet);
    const buildsJobs = await taggedJobs(store, user.personSheet, buildsTab);
    const machiningJobs = ownMach ? await taggedJobs(store, ownMach, ownMach) : [];
    const allJobs = [...buildsJobs, ...machiningJobs];
    const active = allJobs.filter((j) => j.stage !== 'complete');
    const urgentJobs = active.filter((j) => j.urgent);
    const overdueJobs = active.filter((j) => isOverdue(j));
    const approachingDeadlines = active
      .filter((j) => j.expectedFinish)
      .sort((a, b) => new Date(a.expectedFinish) - new Date(b.expectedFinish))
      .slice(0, 5);

    result.personal = {
      activeBuildsCount: buildsJobs.filter((j) => j.stage !== 'complete').length,
      activeMachiningCount: ownMach ? machiningJobs.filter((j) => j.stage !== 'complete').length : null,
      urgentCount: urgentJobs.length,
      overdueCount: overdueJobs.length,
      approachingDeadlines,
      urgentJobs: urgentJobs.slice(0, 5),
      buildsTab,
      machiningTab: ownMach,
    };
  } else {
    result.personal = null;
  }

  // ---------- Shop-wide: total active Builds (everyone sees this) ----------
  let shopWideActiveBuilds = 0;
  for (const sheet of BUILD_SHEET_IDS) {
    shopWideActiveBuilds += (await loadSheet(store, sheet)).filter((j) => j.stage !== 'complete').length;
  }
  result.shopWideActiveBuilds = shopWideActiveBuilds;

  // ---------- Shop-wide: total active Machining (Jake + Mike only) ----------
  if (user.role === 'admin' || session.userId === 'mike') {
    let total = 0;
    for (const machSheet of Object.keys(MACHINING_OWNERS)) {
      total += (await loadSheet(store, machSheet)).filter((j) => j.stage !== 'complete').length;
    }
    result.shopWideMachiningTotal = total;
  } else {
    result.shopWideMachiningTotal = null;
  }

  // ---------- Invoices Awaiting Payment — tile count only ----------
  const isShopWideViewer = user.role === 'admin' || session.userId === 'mike' || session.userId === 'mel';
  if (isShopWideViewer) {
    let total = 0;
    for (const sheet of BUILD_SHEET_IDS) total += (await loadSheet(store, sheet)).filter((j) => j.stage === 'awaitingpayment').length;
    for (const machSheet of Object.keys(MACHINING_OWNERS)) total += (await loadSheet(store, machSheet)).filter((j) => j.stage === 'awaitingpayment').length;
    result.invoicesAwaitingPayment = { scope: 'shopwide', count: total };
  } else if (user.personSheet) {
    const ownMach = ownMachiningSheetFor(user.personSheet);
    const jobs = [
      ...(await loadSheet(store, user.personSheet)),
      ...(ownMach ? await loadSheet(store, ownMach) : []),
    ];
    result.invoicesAwaitingPayment = { scope: 'personal', count: jobs.filter((j) => j.stage === 'awaitingpayment').length };
  } else {
    result.invoicesAwaitingPayment = null;
  }

  return json(200, result);
};
