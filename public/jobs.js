// ===== Dandy Engines — Stage 2: job data layer + card rendering =====

const STAGES = [
  { id: 'notstarted', label: 'Not Started', cls: 'stage-notstarted' },
  { id: 'stripped', label: 'Stripped / Assessment', cls: 'stage-blue' },
  { id: 'waitingparts', label: 'Waiting on Parts', cls: 'stage-blue' },
  { id: 'machining', label: 'Machining', cls: 'stage-yellow' },
  { id: 'dummyassembly', label: 'Awaiting Dummy Assembly', cls: 'stage-amber' },
  { id: 'readyforassembly', label: 'Ready for Assembly', cls: 'stage-green' },
  { id: 'assembling', label: 'Assembling', cls: 'stage-green' },
  { id: 'readyfordyno', label: 'Ready for Dyno', cls: 'stage-green' },
  { id: 'awaitingpayment', label: 'Awaiting Payment', cls: 'stage-amber' },
  { id: 'onhold', label: 'On Hold', cls: 'stage-onhold' },
  { id: 'complete', label: 'Complete', cls: 'stage-green' },
];
function stageInfo(id) {
  return STAGES.find((s) => s.id === id) || STAGES[0];
}

// ---------- API helper ----------
async function api(path, opts = {}) {
  const headers = Object.assign(
    { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
    opts.headers || {}
  );
  const res = await fetch(path, Object.assign({}, opts, { headers }));
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function isOverdue(job) {
  if (!job.expectedFinish || job.stage === 'complete') return false;
  return new Date(job.expectedFinish) < new Date(new Date().toDateString());
}

// ---------- Job card ----------
function jobCardHTML(job, { editable, sheet }) {
  const info = stageInfo(job.stage);
  const badgeCls = job.urgent ? 'stage-urgent' : info.cls;
  const badgeLabel = job.urgent ? `⚠ Urgent — ${info.label}` : info.label;
  const overdue = isOverdue(job);
  const finishText = job.expectedFinish
    ? `<span class="${overdue ? 'overdue' : ''}">Due ${job.expectedFinish}</span>`
    : '';
  const noteCount = job.notes ? job.notes.length : 0;

  return `
  <div class="job-card" data-job-id="${job.id}" data-sheet="${sheet || job.sheet || ''}">
    <div class="job-card-row">
      ${editable ? '<span class="drag-handle" title="Drag to reorder">⠿</span>' : ''}
      <div class="job-card-main">
        <div class="job-card-title">
          <strong>${job.jobNumber || '—'}</strong> ${escapeHtml(job.customer || '')}
        </div>
        <div class="job-card-sub">${escapeHtml(job.engine || '')}</div>
      </div>
      <div class="job-card-meta">
        <span class="stage-badge ${badgeCls}">${badgeLabel}</span>
        ${finishText}
        ${noteCount ? `<span class="note-count">📝 ${noteCount}</span>` : ''}
        ${job.photos && job.photos.length ? `<span class="note-count">📷 ${job.photos.length}</span>` : ''}
      </div>
    </div>
    <div class="job-card-detail" hidden>
      ${editable ? jobEditFormHTML(job, sheet || job.sheet) : jobReadOnlyDetailHTML(job, sheet || job.sheet)}
    </div>
  </div>`;
}

function photoGalleryHTML(job) {
  const photos = job.photos || [];
  return `
    <div class="photo-gallery">
      ${photos.map((id) => `<img class="photo-thumb" data-photo-id="${id}" alt="job photo">`).join('')}
    </div>
  `;
}

async function loadJobPhotos(container, sheet) {
  container.querySelectorAll('img.photo-thumb[data-photo-id]').forEach(async (img) => {
    if (img.dataset.loaded) return;
    img.dataset.loaded = '1';
    try {
      const res = await fetch(`/.netlify/functions/photos?id=${img.dataset.photoId}&sheet=${sheet}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      img.src = URL.createObjectURL(blob);
    } catch { /* thumbnail just stays blank on failure */ }
  });
}

async function uploadJobPhoto(file, sheet, jobId) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return api('/.netlify/functions/photos', { method: 'POST', body: JSON.stringify({ sheet, jobId, dataUrl }) });
}

function jobEditFormHTML(job, sheet) {
  return `
    <div class="detail-grid">
      <label>Job # <input type="text" class="f-jobnumber" value="${escapeHtml(job.jobNumber || '')}"></label>
      <label>Customer <input type="text" class="f-customer" value="${escapeHtml(job.customer || '')}"></label>
      <label>Customer phone <input type="tel" class="f-phone" value="${escapeHtml(job.customerPhone || '')}"></label>
      <label>Engine <input type="text" class="f-engine" value="${escapeHtml(job.engine || '')}"></label>
      <label>Invoice # <input type="text" class="f-invoicenumber" value="${escapeHtml(job.invoiceNumber || '')}"></label>
      <label>Stage
        <select class="f-stage">
          ${STAGES.map((s) => `<option value="${s.id}" ${s.id === job.stage ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </label>
      <label class="urgent-toggle">
        <input type="checkbox" class="f-urgent" ${job.urgent ? 'checked' : ''}> Mark Urgent
      </label>
      <label>Expected finish
        <input type="date" class="f-finish" value="${job.expectedFinish || ''}">
      </label>
    </div>
    <div class="notes-block">
      <h4>Notes</h4>
      <div class="notes-list">
        ${(job.notes || []).map((n) => `
          <div class="note-line"><span class="note-time">${formatDate(n.timestamp)} — ${escapeHtml(n.author)}:</span> ${escapeHtml(n.text)}</div>
        `).join('') || '<p class="muted-sm">No notes yet.</p>'}
      </div>
      <div class="note-add">
        <input type="text" class="f-newnote" placeholder="Add a note...">
        <button class="btn-add-note">Add</button>
      </div>
    </div>
    <div class="notes-block">
      <h4>Photos</h4>
      ${photoGalleryHTML(job)}
      <input type="file" accept="image/*" class="f-photo-upload" style="margin-top:8px;">
    </div>
    <div class="job-actions-row">
      <button class="btn-complete">✓ Complete</button>
      <button class="btn-delete">🗑 Delete</button>
    </div>
  `;
}

function jobReadOnlyDetailHTML(job, sheet) {
  return `
    <div class="notes-block">
      <h4>Notes</h4>
      <div class="notes-list">
        ${(job.notes || []).map((n) => `
          <div class="note-line"><span class="note-time">${formatDate(n.timestamp)} — ${escapeHtml(n.author)}:</span> ${escapeHtml(n.text)}</div>
        `).join('') || '<p class="muted-sm">No notes yet.</p>'}
      </div>
    </div>
    ${job.photos && job.photos.length ? `<div class="notes-block"><h4>Photos</h4>${photoGalleryHTML(job)}</div>` : ''}
  `;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}
