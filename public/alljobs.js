// ===== All Jobs — read-only rollup of every person's sheet =====
// Grouped under a subtitle per person, each section in that person's own
// custom order. Not editable, no independent ordering.

const PERSON_LABELS = { jake: 'Jake', mike: 'Mike', frank: 'Frank', sab: 'Sab', lou: 'Lou' };

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

  const sections = Object.keys(data)
    .filter((sheet) => data[sheet].length || true) // still show empty sheets with a header
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

  content.innerHTML = `
    <input type="text" id="alljobs-search" placeholder="Search all jobs…" class="search-input">
    <div id="alljobs-sections">${sections}</div>
  `;

  document.querySelectorAll('#alljobs-sections .job-card-row').forEach((row) => {
    row.addEventListener('click', () => {
      const card = row.closest('.job-card');
      const detail = card.querySelector('.job-card-detail');
      detail.hidden = !detail.hidden;
      if (!detail.hidden) loadJobPhotos(detail, card.dataset.sheet);
    });
  });

  document.getElementById('alljobs-search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#alljobs-sections .job-card').forEach((card) => {
      card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}
