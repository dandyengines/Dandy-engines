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

// Full user directory, for the "Waiting For: select any user" picker —
// broader than PERSON_NAMES (which only covers the 5 Builds sheet owners).
const ALL_USERS = {
  jake: 'Jake', mike: 'Mike', frank: 'Frank', sab: 'Sab', lou: 'Lou',
  dean: 'Dean', ulrich: 'Ulrich', gus: 'Gus', josh: 'Josh', mel: 'Mel', nathaniel: 'Nathaniel',
};

// Shown in both the editable and read-only job detail views — a job can be
// "waiting on" someone regardless of whether the person looking at it can
// edit the job itself, and the assigned person needs to be able to mark
// their own task complete even from a read-only (e.g. All Builds) view.
function waitingForBlockHTML(job, canAdd) {
  const pending = (job.waitingFor || []).filter((w) => !w.completed);
  const rows = pending.map((w) => `
    <div class="note-line waiting-for-row">
      <span>Waiting on <strong>${escapeHtml(ALL_USERS[w.userId] || w.userId)}</strong>: ${escapeHtml(w.note)} <span class="muted-sm">(added by ${escapeHtml(w.createdByName)})</span></span>
      ${session?.userId === w.userId ? `<button class="btn-complete-waitingfor" data-wf-id="${w.id}">✓ Mark Complete</button>` : ''}
    </div>
  `).join('');
  return `
    <div class="notes-block">
      <h4>Waiting For</h4>
      <div class="notes-list waiting-for-list">${rows || '<p class="muted-sm">Nobody is being waited on for this job.</p>'}</div>
      ${canAdd ? `
        <select class="f-waitingfor-user" style="margin-top:8px;">
          <option value="">+ Add "waiting for"…</option>
          ${Object.entries(ALL_USERS).map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}
        </select>
      ` : ''}
    </div>
  `;
}

// Wires the Mark Complete buttons (always) and, if canAdd, the "select a
// person" dropdown that pops up a note modal. `onDone` is called after any
// successful change so the caller can refresh its own view.
function wireWaitingForBlock(container, sheet, jobId, canAdd, onDone) {
  container.querySelectorAll('.btn-complete-waitingfor').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await api('/.netlify/functions/jobs', {
          method: 'POST', body: JSON.stringify({ action: 'completeWaitingFor', sheet, jobId, waitingForId: btn.dataset.wfId }),
        });
        onDone();
      } catch (err) { alert("Couldn't mark complete: " + err.message); }
    });
  });

  if (!canAdd) return;
  const select = container.querySelector('.f-waitingfor-user');
  select?.addEventListener('click', (e) => e.stopPropagation());
  select?.addEventListener('change', (e) => {
    e.stopPropagation();
    const userId = select.value;
    if (!userId) return;
    const name = ALL_USERS[userId];
    const form = openModal(`
      <h2>Waiting on ${escapeHtml(name)}</h2>
      <label style="display:block;margin-top:8px;">What are you waiting on them for?
        <textarea class="wf-note" rows="3" style="width:100%;margin-top:6px;"></textarea>
      </label>
      <div style="margin-top:10px;display:flex;gap:8px;">
        <button id="wf-save" class="btn-primary">Add</button>
        <button id="wf-cancel">Cancel</button>
      </div>
    `);
    document.getElementById('wf-cancel').addEventListener('click', () => { closeModal(); select.value = ''; });
    document.getElementById('wf-save').addEventListener('click', async () => {
      const note = form.querySelector('.wf-note').value.trim();
      try {
        await api('/.netlify/functions/jobs', {
          method: 'POST', body: JSON.stringify({ action: 'addWaitingFor', sheet, jobId, waitingForUserId: userId, note }),
        });
        closeModal();
        onDone();
      } catch (err) { alert("Couldn't save: " + err.message); }
    });
  });
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
    ${waitingForBlockHTML(job, true)}
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
    ${waitingForBlockHTML(job, false)}
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
