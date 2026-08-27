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

// Calendar-period boundaries (not rolling windows) for the "completed this
// year/month/week" stats — week starts Monday.
function periodBoundaries() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const day = now.getDay(); // 0=Sun..6=Sat
  const diffToMonday = (day === 0 ? 6 : day - 1);
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
  return { startOfYear, startOfMonth, startOfWeek };
}

function countSince(dates, boundary) {
  return dates.filter((d) => d && new Date(d) >= boundary).length;
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

  // ---------- "Waiting For You" — the actual job list ----------
  if (params.action === 'waitingfor') {
    const jobs = [];
    for (const sheet of BUILD_SHEET_IDS) {
      const sheetJobs = await taggedJobs(store, sheet, `builds_${sheet}`);
      for (const j of sheetJobs) {
        const mine = (j.waitingFor || []).filter((w) => w.userId === session.userId && !w.completed);
        if (mine.length) jobs.push({ ...j, myWaitingFor: mine });
      }
    }
    for (const machSheet of Object.keys(MACHINING_OWNERS)) {
      const sheetJobs = await taggedJobs(store, machSheet, machSheet);
      for (const j of sheetJobs) {
        const mine = (j.waitingFor || []).filter((w) => w.userId === session.userId && !w.completed);
        if (mine.length) jobs.push({ ...j, myWaitingFor: mine });
      }
    }
    return json(200, { jobs });
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

  // ---------- Custom section: Gus's dashboard shows Rottler completion stats ----------
  if (session.userId === 'gus') {
    const rottler = await store.get('rottler', { type: 'json' });
    const dates = (rottler?.entries || []).map((e) => e.dateAdded);
    const { startOfYear, startOfMonth, startOfWeek } = periodBoundaries();
    result.rottlerStats = {
      thisYear: countSince(dates, startOfYear),
      thisMonth: countSince(dates, startOfMonth),
      thisWeek: countSince(dates, startOfWeek),
    };
  }

  // ---------- Custom section: Josh's dashboard shows Balancing completion stats ----------
  if (session.userId === 'josh') {
    const balancing = await store.get('balancing', { type: 'json' });
    const dates = (balancing?.entries || []).map((e) => e.dateAdded);
    const { startOfYear, startOfMonth, startOfWeek } = periodBoundaries();
    result.balancingStats = {
      thisYear: countSince(dates, startOfYear),
      thisMonth: countSince(dates, startOfMonth),
      thisWeek: countSince(dates, startOfWeek),
    };
  }

  // ---------- "Waiting For You" — every user, regardless of sheet access ----------
  // Scans every Builds + Machining sheet for a pending waitingFor entry
  // assigned to this person, no matter which sheet it's on or whether they
  // can normally view it — this replaces the one-off Ulrich "Awaiting Dummy
  // Assembly" tile with a general mechanism that works the same for everyone.
  let waitingForCount = 0;
  for (const sheet of [...BUILD_SHEET_IDS, ...Object.keys(MACHINING_OWNERS)]) {
    const jobs = await loadSheet(store, sheet);
    for (const j of jobs) {
      waitingForCount += (j.waitingFor || []).filter((w) => w.userId === session.userId && !w.completed).length;
    }
  }
  result.waitingForCount = waitingForCount;

  // ---------- Feedback tile (admin / anyone granted settings-edit) ----------
  if (user.isSuperAdmin || user.perms.settings === 'edit') {
    const feedback = await store.get('feedback', { type: 'json' });
    result.feedbackCount = (feedback?.entries || []).length;
  }

  return json(200, result);
};
