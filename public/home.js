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

  const waitingForTile = tileHTML('Waiting For You', data.waitingForCount, 'waitingforyou');
  const feedbackTile = (data.feedbackCount !== undefined) ? tileHTML('Feedback', data.feedbackCount, 'feedbacklist') : '';

  content.innerHTML = `
    ${personalSection}
    ${rottlerSection}
    ${balancingSection}
    <h2 class="dash-section-title">Shop-wide</h2>
    <div class="dash-tiles">
      ${tileHTML('Total Active Builds', data.shopWideActiveBuilds, navTabIds.includes('alljobs') ? 'alljobs' : null)}
      ${data.shopWideMachiningTotal !== null ? tileHTML('Total Active Machining', data.shopWideMachiningTotal, navTabIds.includes('allmachining') ? 'allmachining' : null) : ''}
      ${waitingForTile}
      ${invoiceTile}
      ${feedbackTile}
    </div>
  `;

  document.querySelectorAll('.dash-tile[data-tab], .dash-list-row[data-tab]').forEach((btn) => {
    if (!btn.dataset.tab) return;
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });
}

// ===== Waiting For You — dedicated list, reached from the tile =====
// Shows every job (Builds or Machining, regardless of whether this person
// otherwise has access to that sheet) with a pending "waiting for" entry
// assigned to them. Uses the same job-card component every other list
// uses, so it collapses/expands the same way and shows full job details
// (notes, the Waiting For block with Mark Complete, etc) when tapped.
async function renderWaitingForYouTab() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="stub-card">Loading…</div>`;
  let data;
  try {
    data = await api('/.netlify/functions/dashboard?action=waitingfor');
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load: ${escapeHtml(e.message)}</div>`;
    return;
  }
  content.innerHTML = `
    <h2 class="section-title">Waiting For You</h2>
    <div class="job-list">
      ${data.jobs.map((j) => `
        <div class="wfy-card">
          <div class="wfy-summary">${escapeHtml(j.myWaitingFor.map((w) => w.note).join(' · '))}</div>
          ${jobCardHTML(j, { editable: false, sheet: j.tabId })}
          <button class="wfy-goto-job" data-tab="${j.tabId}">Go to job →</button>
        </div>
      `).join('') || '<p class="muted-sm">Nothing waiting on you right now.</p>'}
    </div>
  `;

  // Standard collapse/expand behavior, same as every other job list.
  content.querySelectorAll('.job-card-row').forEach((row) => {
    row.addEventListener('click', () => {
      const card = row.closest('.job-card');
      const detail = card.querySelector('.job-card-detail');
      detail.hidden = !detail.hidden;
      if (!detail.hidden) loadJobPhotos(detail, card.dataset.sheet);
    });
    const card = row.closest('.job-card');
    const detail = card.querySelector('.job-card-detail');
    wireWaitingForBlock(detail, card.dataset.sheet, card.dataset.jobId, false, () => renderWaitingForYouTab());
  });

  content.querySelectorAll('.wfy-goto-job').forEach((btn) => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });
}

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
