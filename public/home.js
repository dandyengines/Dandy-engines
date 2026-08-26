// ===== Home dashboard =====
// Personal "what's on my plate" scope, plus shop-wide tiles that are
// visible more broadly (per dashboard.js access rules).

function tileHTML(label, value, tabId) {
  return `
    <button class="dash-tile" data-tab="${tabId || ''}" ${tabId ? '' : 'disabled'}>
      <div class="dash-tile-value">${value}</div>
      <div class="dash-tile-label">${label}</div>
    </button>`;
}

function dashJobRowHTML(job, tabId) {
  const dueText = job.expectedFinish ? `Due ${job.expectedFinish}` : '';
  return `
    <button class="dash-list-row" data-tab="${tabId}">
      <strong>${job.jobNumber || '—'}</strong> ${escapeHtml(job.customer || '')}
      <span class="muted-sm">${escapeHtml(dueText)}</span>
    </button>`;
}

async function renderHomeTab() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="stub-card">Loading…</div>`;

  let data;
  try {
    data = await api('/.netlify/functions/dashboard');
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load dashboard: ${escapeHtml(e.message)}</div>`;
    return;
  }

  const p = data.personal;
  const personalSection = p ? `
    <h2 class="dash-section-title">What's on your plate</h2>
    <div class="dash-tiles">
      ${tileHTML('Active Jobs', p.activeCount, p.homeTab)}
      ${tileHTML('Urgent', p.urgentCount, p.homeTab)}
      ${tileHTML('Overdue', p.overdueCount, p.homeTab)}
      ${tileHTML('On Hold', p.onHoldCount, p.homeTab)}
    </div>
    <div class="dash-columns">
      <div>
        <h3 class="dash-list-title">Approaching Deadlines</h3>
        <div class="dash-list">${p.approachingDeadlines.map((j) => dashJobRowHTML(j, p.homeTab)).join('') || '<p class="muted-sm">Nothing due soon.</p>'}</div>
      </div>
      <div>
        <h3 class="dash-list-title">Urgent Jobs</h3>
        <div class="dash-list">${p.urgentJobs.map((j) => dashJobRowHTML(j, p.homeTab)).join('') || '<p class="muted-sm">No urgent jobs.</p>'}</div>
      </div>
    </div>
  ` : '';

  const invoiceTile = data.invoicesAwaitingPayment
    ? tileHTML(
        data.invoicesAwaitingPayment.scope === 'shopwide' ? 'Invoices Awaiting Payment (shop-wide)' : 'Invoices Awaiting Payment',
        data.invoicesAwaitingPayment.count,
        navTabIds.includes('partpayments') ? 'partpayments' : null
      )
    : '';

  content.innerHTML = `
    ${personalSection}
    <h2 class="dash-section-title">Shop-wide</h2>
    <div class="dash-tiles">
      ${tileHTML('Total Active Builds', data.shopWideActiveBuilds, navTabIds.includes('alljobs') ? 'alljobs' : null)}
      ${data.shopWideMachiningTotal !== null ? tileHTML('Total Active Machining', data.shopWideMachiningTotal, navTabIds.includes('allmachining') ? 'allmachining' : null) : ''}
      ${invoiceTile}
    </div>
  `;

  document.querySelectorAll('.dash-tile[data-tab], .dash-list-row[data-tab]').forEach((btn) => {
    if (!btn.dataset.tab) return;
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });
}
