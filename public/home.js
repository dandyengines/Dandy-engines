// ===== Home dashboard =====

function tileHTML(label, value, tabId) {
  return `
    <button class="dash-tile" data-tab="${tabId || ''}" ${tabId ? '' : 'disabled'}>
      <div class="dash-tile-value">${value}</div>
      <div class="dash-tile-label">${label}</div>
    </button>`;
}

function dashJobRowHTML(job) {
  const dueText = job.expectedFinish ? `Due ${job.expectedFinish}` : '';
  return `
    <button class="dash-list-row" data-tab="${job.tabId}">
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
      ${tileHTML('Active Builds', p.activeBuildsCount, p.buildsTab)}
      ${p.machiningTab !== null ? tileHTML('Active Machining', p.activeMachiningCount, p.machiningTab) : ''}
      ${tileHTML('Urgent', p.urgentCount, p.buildsTab)}
      ${tileHTML('Overdue', p.overdueCount, p.buildsTab)}
    </div>
    <div class="dash-columns">
      <div>
        <h3 class="dash-list-title">Approaching Deadlines</h3>
        <div class="dash-list">${p.approachingDeadlines.map(dashJobRowHTML).join('') || '<p class="muted-sm">Nothing due soon.</p>'}</div>
      </div>
      <div>
        <h3 class="dash-list-title">Urgent Jobs</h3>
        <div class="dash-list">${p.urgentJobs.map(dashJobRowHTML).join('') || '<p class="muted-sm">No urgent jobs.</p>'}</div>
      </div>
    </div>
  ` : '';

  const invoiceTile = data.invoicesAwaitingPayment
    ? tileHTML(
        data.invoicesAwaitingPayment.scope === 'shopwide' ? 'Invoices Awaiting Payment (shop-wide)' : 'Invoices Awaiting Payment',
        data.invoicesAwaitingPayment.count,
        'invoicesawaiting'
      )
    : '';

  const rottlerSection = data.rottlerStats ? `
    <h2 class="dash-section-title">Rottler — Jobs Completed</h2>
    <div class="dash-tiles">
      ${tileHTML('This Week', data.rottlerStats.thisWeek, navTabIds.includes('rottler') ? 'rottler' : null)}
      ${tileHTML('This Month', data.rottlerStats.thisMonth, navTabIds.includes('rottler') ? 'rottler' : null)}
      ${tileHTML('This Year', data.rottlerStats.thisYear, navTabIds.includes('rottler') ? 'rottler' : null)}
    </div>
  ` : '';

  const balancingSection = data.balancingStats ? `
    <h2 class="dash-section-title">Balancing — Jobs Completed</h2>
    <div class="dash-tiles">
      ${tileHTML('This Week', data.balancingStats.thisWeek, navTabIds.includes('balancing') ? 'balancing' : null)}
      ${tileHTML('This Month', data.balancingStats.thisMonth, navTabIds.includes('balancing') ? 'balancing' : null)}
      ${tileHTML('This Year', data.balancingStats.thisYear, navTabIds.includes('balancing') ? 'balancing' : null)}
    </div>
  ` : '';

  const dummyAssemblyTile = (data.dummyAssemblyCount !== undefined)
    ? tileHTML('Awaiting Dummy Assembly (shop-wide)', data.dummyAssemblyCount, navTabIds.includes('alljobs') ? 'alljobs' : null)
    : '';

  content.innerHTML = `
    ${personalSection}
    ${rottlerSection}
    ${balancingSection}
    <h2 class="dash-section-title">Shop-wide</h2>
    <div class="dash-tiles">
      ${tileHTML('Total Active Builds', data.shopWideActiveBuilds, navTabIds.includes('alljobs') ? 'alljobs' : null)}
      ${data.shopWideMachiningTotal !== null ? tileHTML('Total Active Machining', data.shopWideMachiningTotal, navTabIds.includes('allmachining') ? 'allmachining' : null) : ''}
      ${dummyAssemblyTile}
      ${invoiceTile}
    </div>
  `;

  document.querySelectorAll('.dash-tile[data-tab], .dash-list-row[data-tab]').forEach((btn) => {
    if (!btn.dataset.tab) return;
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });
}

// ===== Invoices Awaiting Payment — dedicated list, reached from the tile =====
async function renderInvoicesAwaitingTab() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="stub-card">Loading…</div>`;
  let data;
  try {
    data = await api('/.netlify/functions/dashboard?action=awaitingpayment');
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load: ${escapeHtml(e.message)}</div>`;
    return;
  }
  content.innerHTML = `
    <h2 class="section-title">Invoices Awaiting Payment ${data.scope === 'shopwide' ? '(shop-wide)' : ''}</h2>
    <div class="job-list">
      ${data.jobs.map((j) => jobCardHTML(j, { editable: false, sheet: j.tabId })).join('') || '<p class="muted-sm">Nothing awaiting payment.</p>'}
    </div>
  `;
  document.querySelectorAll('#content .job-card').forEach((card, i) => {
    const job = data.jobs[i];
    if (!job) return;
    card.querySelector('.job-card-row').addEventListener('click', () => setActiveTab(job.tabId));
  });
}
