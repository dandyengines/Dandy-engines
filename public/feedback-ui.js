// ===== Feedback =====
// Submit: a simple popup text box, available to everyone from Settings.
// Review: admin-only (or anyone granted settings-edit) list, reached from
// the Feedback dashboard tile or Settings, with delete per entry.

function openFeedbackModal() {
  const form = openModal(`
    <h2>Leave Feedback</h2>
    <p class="muted-sm">Think something needs to change or be added? Let Jake know.</p>
    <textarea class="fb-text" rows="5" style="width:100%;margin-top:10px;" placeholder="What would you like to see changed or added?"></textarea>
    <div style="margin-top:10px;display:flex;gap:8px;">
      <button id="fb-save" class="btn-primary">Send Feedback</button>
      <button id="fb-cancel">Cancel</button>
    </div>
  `);
  document.getElementById('fb-cancel').addEventListener('click', () => closeModal());
  document.getElementById('fb-save').addEventListener('click', async () => {
    const text = form.querySelector('.fb-text').value.trim();
    if (!text) return;
    try {
      await api('/.netlify/functions/feedback', { method: 'POST', body: JSON.stringify({ action: 'submit', text }) });
      closeModal();
    } catch (e) {
      alert("Couldn't send feedback: " + e.message);
    }
  });
}

async function renderFeedbackListTab() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="stub-card">Loading…</div>`;
  let data;
  try {
    data = await api('/.netlify/functions/feedback');
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load: ${escapeHtml(e.message)}</div>`;
    return;
  }
  paintFeedbackList(data.entries);
}

function paintFeedbackList(entries) {
  const content = document.getElementById('content');
  content.innerHTML = `
    <h2 class="section-title">Feedback</h2>
    <div class="job-list">
      ${entries.map((e) => `
        <div class="job-card" data-fb-id="${e.id}">
          <div class="job-card-row" style="cursor:default;">
            <div class="job-card-main">
              <div class="job-card-title">${escapeHtml(e.userName)}</div>
              <div class="job-card-sub">${escapeHtml(e.text)}</div>
            </div>
            <div class="job-card-meta">
              <span class="muted-sm">${formatDate(e.createdAt)}</span>
              <button class="fb-delete-btn">🗑 Delete</button>
            </div>
          </div>
        </div>
      `).join('') || '<p class="muted-sm">No feedback yet.</p>'}
    </div>
  `;
  content.querySelectorAll('.fb-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.job-card').dataset.fbId;
      if (!confirm('Delete this feedback entry?')) return;
      try {
        const { entries } = await api('/.netlify/functions/feedback', { method: 'POST', body: JSON.stringify({ action: 'delete', id }) });
        paintFeedbackList(entries);
      } catch (e) { alert("Couldn't delete: " + e.message); }
    });
  });
}
