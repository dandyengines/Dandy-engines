// ===== All Machining — read-only rollup of every person's Machining sheet =====
// Exact structural copy of All Builds (alljobs.js): same viewer list, same
// grouped-by-person layout, same read-only rule — just pointed at each
// person's Machining data instead of their Builds data.

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

  const sections = Object.keys(data)
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

  content.innerHTML = `
    <input type="text" id="allmachining-search" placeholder="Search all machining jobs…" class="search-input">
    <div id="allmachining-sections">${sections}</div>
  `;

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
