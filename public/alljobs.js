// ===== All Builds — read-only rollup of every person's sheet =====
// Default: grouped under a subtitle per person, each section in that
// person's own custom order. Also sortable by status, job #, date, or name
// as a single flat list (with a small owner tag per card so you don't lose
// track of whose job it is once it's out of its person-grouped section).

const PERSON_LABELS = { jake: 'Jake', mike: 'Mike', frank: 'Frank', sab: 'Sab', lou: 'Lou' };

let allJobsState = { data: null, sortMode: 'person', statusFilter: '' };

async function renderAllJobsTab() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="stub-card">Loading…</div>`;

  let data;
  try {
    data = await api('/.netlify/functions/jobs?action=alljobs');
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load: ${escapeHtml(e.message)}</div>`;
    return;
  }
  allJobsState.data = data;
  paintAllJobs();
}

function paintAllJobs() {
  const content = document.getElementById('content');
  const { data, sortMode } = allJobsState;

  let sectionsHTML;
  if (sortMode === 'person') {
    sectionsHTML = Object.keys(data)
      .map((sheet) => {
        const jobs = data[sheet].filter((j) => j.stage !== 'complete');
        return `
          <div class="person-section">
            <h3 class="person-heading">${PERSON_LABELS[sheet] || sheet}</h3>
            <div class="job-list">
              ${jobs.map((j) => jobCardHTML(j, { editable: false, sheet })).join('') || '<p class="muted-sm">No active jobs.</p>'}
            </div>
          </div>`;
      })
      .join('');
  } else if (sortMode === 'status') {
    // Grouped by pipeline stage instead of by person, in pipeline order —
    // this is what lets someone like Ulrich see "everyone's jobs that are
    // Awaiting Dummy Assembly" in one place. The status picker narrows it
    // down to just one stage, as a flat list, when one is chosen.
    const flat = [];
    for (const sheet of Object.keys(data)) {
      for (const j of data[sheet]) if (j.stage !== 'complete') flat.push({ ...j, sheet });
    }
    if (allJobsState.statusFilter) {
      const jobs = flat.filter((j) => j.stage === allJobsState.statusFilter);
      sectionsHTML = `<div class="job-list">${jobs.map((j) => ownerTaggedCardHTML(j, j.sheet)).join('') || '<p class="muted-sm">No active jobs at this status.</p>'}</div>`;
    } else {
      sectionsHTML = STAGES.filter((s) => s.id !== 'complete').map((stage) => {
        const jobs = flat.filter((j) => j.stage === stage.id);
        if (!jobs.length) return '';
        return `
          <div class="person-section">
            <h3 class="person-heading">${stage.label}</h3>
            <div class="job-list">
              ${jobs.map((j) => ownerTaggedCardHTML(j, j.sheet)).join('')}
            </div>
          </div>`;
      }).join('') || '<p class="muted-sm">No active jobs.</p>';
    }
  } else {
    // Flat list sorted by job #, date, or customer name.
    const flat = [];
    for (const sheet of Object.keys(data)) {
      for (const j of data[sheet]) if (j.stage !== 'complete') flat.push({ ...j, sheet });
    }
    if (sortMode === 'jobnumber') flat.sort((a, b) => (a.jobNumber || '').localeCompare(b.jobNumber || '', undefined, { numeric: true }));
    else if (sortMode === 'date') flat.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
    else if (sortMode === 'name') flat.sort((a, b) => (a.customer || '').localeCompare(b.customer || ''));
    sectionsHTML = `<div class="job-list">${flat.map((j) => ownerTaggedCardHTML(j, j.sheet)).join('') || '<p class="muted-sm">No active jobs.</p>'}</div>`;
  }

  content.innerHTML = `
    <div class="sheet-toolbar">
      <div class="toolbar-group">
        <button class="chip ${sortMode === 'person' ? 'chip-active' : ''}" data-ajsort="person">Grouped by Person</button>
        <button class="chip ${sortMode === 'status' ? 'chip-active' : ''}" data-ajsort="status">By Status</button>
        <button class="chip ${sortMode === 'jobnumber' ? 'chip-active' : ''}" data-ajsort="jobnumber">Job #</button>
        <button class="chip ${sortMode === 'date' ? 'chip-active' : ''}" data-ajsort="date">Date</button>
        <button class="chip ${sortMode === 'name' ? 'chip-active' : ''}" data-ajsort="name">Name</button>
      </div>
      ${sortMode === 'status' ? `
      <div class="toolbar-group">
        <select id="alljobs-status-filter">
          <option value="">All Statuses (grouped)</option>
          ${STAGES.filter((s) => s.id !== 'complete').map((s) => `<option value="${s.id}" ${allJobsState.statusFilter === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </div>` : ''}
    </div>
    <input type="text" id="alljobs-search" placeholder="Search all jobs…" class="search-input">
    <div id="alljobs-sections">${sectionsHTML}</div>
  `;

  document.querySelectorAll('[data-ajsort]').forEach((btn) => btn.addEventListener('click', () => { allJobsState.sortMode = btn.dataset.ajsort; paintAllJobs(); }));
  document.getElementById('alljobs-status-filter')?.addEventListener('change', (e) => { allJobsState.statusFilter = e.target.value; paintAllJobs(); });

  document.querySelectorAll('#alljobs-sections .job-card-row').forEach((row) => {
    row.addEventListener('click', () => {
      const card = row.closest('.job-card');
      const detail = card.querySelector('.job-card-detail');
      detail.hidden = !detail.hidden;
      if (!detail.hidden) loadJobPhotos(detail, card.dataset.sheet);
    });
    const card = row.closest('.job-card');
    const detail = card.querySelector('.job-card-detail');
    wireWaitingForBlock(detail, card.dataset.sheet, card.dataset.jobId, false, () => renderAllJobsTab());
  });

  document.getElementById('alljobs-search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#alljobs-sections .job-card').forEach((card) => {
      card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

// Wraps jobCardHTML with a small "whose job is this" tag — used whenever
// jobs from different people are shown outside their person-grouped section.
function ownerTaggedCardHTML(job, sheet) {
  return `<div class="owner-tagged"><span class="owner-tag">${PERSON_LABELS[sheet] || sheet}</span>${jobCardHTML(job, { editable: false, sheet })}</div>`;
}
