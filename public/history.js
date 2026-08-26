// ===== History — Jake only, under Settings =====

async function renderHistoryTab() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="stub-card">Loading…</div>`;
  let data;
  try {
    data = await api('/.netlify/functions/history');
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load: ${escapeHtml(e.message)}</div>`;
    return;
  }
  paintHistory(data.entries);
}

function paintHistory(entries) {
  const content = document.getElementById('content');
  content.innerHTML = `
    <p class="muted-sm" style="margin-bottom:14px;">Last 60 days of activity across every tab. Reverting restores that section back to how it was right before the action.</p>
    <div id="history-list" class="job-list">
      ${entries.map(historyRowHTML).join('') || '<p class="muted-sm">No activity logged yet.</p>'}
    </div>
  `;
  document.querySelectorAll('.history-revert-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Revert this action? This restores the affected section to how it was right before this change.')) return;
      try {
        await api('/.netlify/functions/history', {
          method: 'POST',
          body: JSON.stringify({ action: 'revert', historyId: btn.dataset.historyId }),
        });
        renderHistoryTab();
      } catch (e) {
        alert("Couldn't revert: " + e.message);
      }
    });
  });
}

function historyRowHTML(entry) {
  return `
  <div class="job-card">
    <div class="job-card-row" style="cursor:default;">
      <div class="job-card-main">
        <div class="job-card-title">${escapeHtml(entry.description)}</div>
        <div class="job-card-sub">${formatDate(entry.timestamp)} · ${escapeHtml(entry.userName)}</div>
      </div>
      <button class="history-revert-btn" data-history-id="${entry.id}">↺ Revert</button>
    </div>
  </div>`;
}
