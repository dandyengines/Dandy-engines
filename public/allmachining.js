// ===== All Machining — read-only rollup of every person's Machining sheet =====
// Same sort options as All Builds: grouped by person (default), by status,
// job #, date, or name.

let allMachiningState = { data: null, sortMode: 'person', statusFilter: '' };

async function renderAllMachiningTab() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="stub-card">Loading…</div>`;

  let data;
  try {
    data = await api('/.netlify/functions/jobs?action=allmachining');
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load: ${escapeHtml(e.message)}</div>`;
    return;
  }
  allMachiningState.data = data;
  paintAllMachining();
}

function paintAllMachining() {
  const content = document.getElementById('content');
  const { data, sortMode } = allMachiningState;

  let sectionsHTML;
  if (sortMode === 'person') {
    sectionsHTML = Object.keys(data)
      .map((owner) => {
        const jobs = data[owner].filter((j) => j.stage !== 'complete');
        return `
          <div class="person-section">
            <h3 class="person-heading">${PERSON_NAMES[owner] || owner}</h3>
            <div class="job-list">
              ${jobs.map((j) => jobCardHTML(j, { editable: false, sheet: j.sheet })).join('') || '<p class="muted-sm">No active machining jobs.</p>'}
            </div>
          </div>`;
      })
      .join('');
  } else if (sortMode === 'status') {
    const flat = [];
    for (const owner of Object.keys(data)) {
      for (const j of data[owner]) if (j.stage !== 'complete') flat.push({ ...j, owner });
    }
    if (allMachiningState.statusFilter) {
      const jobs = flat.filter((j) => j.stage === allMachiningState.statusFilter);
      sectionsHTML = `<div class="job-list">${jobs.map((j) => `<div class="owner-tagged"><span class="owner-tag">${PERSON_NAMES[j.owner] || j.owner}</span>${jobCardHTML(j, { editable: false, sheet: j.sheet })}</div>`).join('') || '<p class="muted-sm">No active machining jobs at this status.</p>'}</div>`;
    } else {
      sectionsHTML = STAGES.filter((s) => s.id !== 'complete').map((stage) => {
        const jobs = flat.filter((j) => j.stage === stage.id);
        if (!jobs.length) return '';
        return `
          <div class="person-section">
            <h3 class="person-heading">${stage.label}</h3>
            <div class="job-list">
              ${jobs.map((j) => `<div class="owner-tagged"><span class="owner-tag">${PERSON_NAMES[j.owner] || j.owner}</span>${jobCardHTML(j, { editable: false, sheet: j.sheet })}</div>`).join('')}
            </div>
          </div>`;
      }).join('') || '<p class="muted-sm">No active machining jobs.</p>';
    }
  } else {
    const flat = [];
    for (const owner of Object.keys(data)) {
      for (const j of data[owner]) if (j.stage !== 'complete') flat.push({ ...j, owner });
    }
    if (sortMode === 'jobnumber') flat.sort((a, b) => (a.jobNumber || '').localeCompare(b.jobNumber || '', undefined, { numeric: true }));
    else if (sortMode === 'date') flat.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
    else if (sortMode === 'name') flat.sort((a, b) => (a.customer || '').localeCompare(b.customer || ''));
    sectionsHTML = `<div class="job-list">${flat.map((j) => `<div class="owner-tagged"><span class="owner-tag">${PERSON_NAMES[j.owner] || j.owner}</span>${jobCardHTML(j, { editable: false, sheet: j.sheet })}</div>`).join('') || '<p class="muted-sm">No active machining jobs.</p>'}</div>`;
  }

  content.innerHTML = `
    <div class="sheet-toolbar">
      <div class="toolbar-group">
        <button class="chip ${sortMode === 'person' ? 'chip-active' : ''}" data-amsort="person">Grouped by Person</button>
        <button class="chip ${sortMode === 'status' ? 'chip-active' : ''}" data-amsort="status">By Status</button>
        <button class="chip ${sortMode === 'jobnumber' ? 'chip-active' : ''}" data-amsort="jobnumber">Job #</button>
        <button class="chip ${sortMode === 'date' ? 'chip-active' : ''}" data-amsort="date">Date</button>
        <button class="chip ${sortMode === 'name' ? 'chip-active' : ''}" data-amsort="name">Name</button>
      </div>
      ${sortMode === 'status' ? `
      <div class="toolbar-group">
        <select id="allmachining-status-filter">
          <option value="">All Statuses (grouped)</option>
          ${STAGES.filter((s) => s.id !== 'complete').map((s) => `<option value="${s.id}" ${allMachiningState.statusFilter === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </div>` : ''}
    </div>
    <input type="text" id="allmachining-search" placeholder="Search all machining jobs…" class="search-input">
    <div id="allmachining-sections">${sectionsHTML}</div>
  `;

  document.querySelectorAll('[data-amsort]').forEach((btn) => btn.addEventListener('click', () => { allMachiningState.sortMode = btn.dataset.amsort; paintAllMachining(); }));
  document.getElementById('allmachining-status-filter')?.addEventListener('change', (e) => { allMachiningState.statusFilter = e.target.value; paintAllMachining(); });

  document.querySelectorAll('#allmachining-sections .job-card-row').forEach((row) => {
    row.addEventListener('click', () => {
      const card = row.closest('.job-card');
      const detail = card.querySelector('.job-card-detail');
      detail.hidden = !detail.hidden;
      if (!detail.hidden) loadJobPhotos(detail, card.dataset.sheet);
    });
  });

  document.getElementById('allmachining-search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#allmachining-sections .job-card').forEach((card) => {
      card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}
