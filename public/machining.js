// ===== Machining — one private sheet per person (Jake/Lou/Sab/Mike) =====
// Each person's machining tab is private to them + Jake (admin). Tab id
// doubles as the storage "sheet" key: 'machining' (Jake's, unchanged from
// the original single-sheet build) or 'machining_<person>' for the rest.

const MACHINING_LABELS = {
  machining: "Jake's Machining",
  machining_lou: "Lou's Machining",
  machining_sab: "Sab's Machining",
  machining_mike: "Mike's Machining",
};

const machiningStates = {}; // keyed by sheet id: { sortMode, showOnHold, showComplete, data }

function getMachiningState(sheet) {
  if (!machiningStates[sheet]) {
    machiningStates[sheet] = { sortMode: 'custom', showOnHold: true, showComplete: false, data: null };
  }
  return machiningStates[sheet];
}

async function renderMachiningTab(sheet) {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="stub-card">Loading…</div>`;
  const state = getMachiningState(sheet);
  let data;
  try {
    data = await api(`/.netlify/functions/jobs?action=sheet&sheet=${sheet}`);
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load: ${escapeHtml(e.message)}</div>`;
    return;
  }
  state.data = data;
  paintMachining(sheet);
}

function paintMachining(sheet) {
  const content = document.getElementById('content');
  const state = getMachiningState(sheet);
  const { data, sortMode, showOnHold, showComplete } = state;
  const label = MACHINING_LABELS[sheet] || 'Machining';

  let jobs = data.order.map((id) => data.jobs.find((j) => j.id === id)).filter(Boolean);
  if (!showComplete) jobs = jobs.filter((j) => j.stage !== 'complete');
  if (!showOnHold) jobs = jobs.filter((j) => j.stage !== 'onhold');
  if (sortMode === 'date') jobs = [...jobs].sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
  else if (sortMode === 'jobnumber') jobs = [...jobs].sort((a, b) => (a.jobNumber || '').localeCompare(b.jobNumber || '', undefined, { numeric: true }));
  else if (sortMode === 'name') jobs = [...jobs].sort((a, b) => (a.customer || '').localeCompare(b.customer || ''));
  else if (sortMode === 'status') jobs = [...jobs].sort((a, b) => STAGES.findIndex((s) => s.id === a.stage) - STAGES.findIndex((s) => s.id === b.stage));

  content.innerHTML = `
    <div class="sheet-toolbar">
      <div class="toolbar-group">
        <button class="chip ${sortMode === 'custom' ? 'chip-active' : ''}" data-msort="custom">Custom Order</button>
        <button class="chip ${sortMode === 'date' ? 'chip-active' : ''}" data-msort="date">Date Added</button>
        <button class="chip ${sortMode === 'jobnumber' ? 'chip-active' : ''}" data-msort="jobnumber">Job #</button>
        <button class="chip ${sortMode === 'name' ? 'chip-active' : ''}" data-msort="name">Name</button>
        <button class="chip ${sortMode === 'status' ? 'chip-active' : ''}" data-msort="status">Status</button>
      </div>
      <div class="toolbar-group">
        <label class="chip-toggle"><input type="checkbox" id="m-toggle-onhold" ${showOnHold ? 'checked' : ''}> Show On Hold</label>
        <label class="chip-toggle"><input type="checkbox" id="m-toggle-complete" ${showComplete ? 'checked' : ''}> Show Completed</label>
      </div>
      ${data.canEdit ? `<button id="m-add-btn" class="btn-primary">+ New Job</button>` : ''}
    </div>
    <div id="m-list" class="job-list" data-sheet="${sheet}">${jobs.map((j) => jobCardHTML(j, { editable: data.canEdit, sheet })).join('') || `<p class="muted-sm">No jobs on ${label}.</p>`}</div>
  `;

  document.querySelectorAll('[data-msort]').forEach((b) => b.addEventListener('click', () => { state.sortMode = b.dataset.msort; paintMachining(sheet); }));
  document.getElementById('m-toggle-onhold').addEventListener('change', (e) => { state.showOnHold = e.target.checked; paintMachining(sheet); });
  document.getElementById('m-toggle-complete').addEventListener('change', (e) => { state.showComplete = e.target.checked; paintMachining(sheet); });
  document.getElementById('m-add-btn')?.addEventListener('click', () => showMachiningNewForm(sheet));
  wireMachiningCards(sheet);
  if (sortMode === 'custom' && data.canEdit) enableMachiningDragReorder(sheet);
}

function showMachiningNewForm(sheet) {
  const form = openModal(`
    <h2>New Machining Job</h2>
    <div class="detail-grid">
      <label>Job # <input type="text" class="mnf-jobnumber"></label>
      <label>Customer <input type="text" class="mnf-customer"></label>
      <label>Customer phone <input type="tel" class="mnf-phone"></label>
      <label>Engine <input type="text" class="mnf-engine"></label>
      <label>Stage
        <select class="mnf-stage">${STAGES.filter((s) => s.id !== 'complete').map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select>
      </label>
      <label>Expected finish <input type="date" class="mnf-finish"></label>
    </div>
    <label style="display:block;margin-top:8px;">Initial note <textarea class="mnf-notes" rows="2" style="width:100%;"></textarea></label>
    <div style="margin-top:10px;display:flex;gap:8px;">
      <button id="mnf-save" class="btn-primary">Save</button>
      <button id="mnf-cancel">Cancel</button>
    </div>
  `);
  document.getElementById('mnf-cancel').addEventListener('click', () => closeModal());
  document.getElementById('mnf-save').addEventListener('click', async () => {
    const payload = {
      action: 'create', sheet,
      jobNumber: form.querySelector('.mnf-jobnumber').value,
      customer: form.querySelector('.mnf-customer').value,
      customerPhone: form.querySelector('.mnf-phone').value,
      engine: form.querySelector('.mnf-engine').value,
      stage: form.querySelector('.mnf-stage').value,
      expectedFinish: form.querySelector('.mnf-finish').value || null,
      notes: form.querySelector('.mnf-notes').value,
    };
    try {
      const { job } = await api('/.netlify/functions/jobs', { method: 'POST', body: JSON.stringify(payload) });
      const state = getMachiningState(sheet);
      state.data.jobs.push(job);
      state.data.order.push(job.id);
      closeModal();
      paintMachining(sheet);
    } catch (e) { alert("Couldn't save: " + e.message); }
  });
}

function wireMachiningCards(sheet) {
  document.querySelectorAll('#m-list .job-card').forEach((card) => {
    const row = card.querySelector('.job-card-row');
    const detail = card.querySelector('.job-card-detail');
    row.addEventListener('click', (e) => {
      if (!e.target.closest('.drag-handle')) {
        detail.hidden = !detail.hidden;
        if (!detail.hidden) loadJobPhotos(detail, sheet);
      }
    });

    const jobId = card.dataset.jobId;
    card.querySelector('.f-photo-upload')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await uploadJobPhoto(file, sheet, jobId);
        await renderMachiningTab(sheet);
      } catch (err) { alert("Couldn't upload photo: " + err.message); }
    });
    const save = async (patch) => {
      try { await api('/.netlify/functions/jobs', { method: 'POST', body: JSON.stringify({ action: 'update', sheet, jobId, patch }) }); }
      catch (e) { alert("Couldn't save: " + e.message); }
    };
    card.querySelector('.f-jobnumber')?.addEventListener('change', (e) => save({ jobNumber: e.target.value }));
    card.querySelector('.f-customer')?.addEventListener('change', (e) => save({ customer: e.target.value }));
    card.querySelector('.f-phone')?.addEventListener('change', (e) => save({ customerPhone: e.target.value }));
    card.querySelector('.f-engine')?.addEventListener('change', (e) => save({ engine: e.target.value }));
    card.querySelector('.f-invoicenumber')?.addEventListener('change', (e) => save({ invoiceNumber: e.target.value }));
    card.querySelector('.f-stage')?.addEventListener('change', (e) => save({ stage: e.target.value }));
    card.querySelector('.f-urgent')?.addEventListener('change', (e) => save({ urgent: e.target.checked }));
    card.querySelector('.f-finish')?.addEventListener('change', (e) => save({ expectedFinish: e.target.value || null }));

    card.querySelector('.btn-complete')?.addEventListener('click', async () => {
      const previousStage = jobId && (getMachiningState(sheet).data.jobs.find((j) => j.id === jobId) || {}).stage;
      await save({ stage: 'complete' });
      await renderMachiningTab(sheet);
      showUndoToast('Job marked complete.', async () => {
        await api('/.netlify/functions/jobs', { method: 'POST', body: JSON.stringify({ action: 'update', sheet, jobId, patch: { stage: previousStage || 'notstarted' } }) });
        await renderMachiningTab(sheet);
      });
    });

    card.querySelector('.btn-delete')?.addEventListener('click', async () => {
      if (!confirm('Delete this job? You can undo for a few seconds after.')) return;
      let deletedJob, deletedIndex;
      try {
        ({ deletedJob, deletedIndex } = await api('/.netlify/functions/jobs', { method: 'POST', body: JSON.stringify({ action: 'delete', sheet, jobId }) }));
      } catch (e) { alert("Couldn't delete: " + e.message); return; }
      await renderMachiningTab(sheet);
      showUndoToast(`Deleted job ${deletedJob.jobNumber || '(no #)'}.`, async () => {
        await api('/.netlify/functions/jobs', { method: 'POST', body: JSON.stringify({ action: 'restore', sheet, job: deletedJob, atIndex: deletedIndex }) });
        await renderMachiningTab(sheet);
      });
    });

    card.querySelector('.btn-add-note')?.addEventListener('click', async () => {
      const input = card.querySelector('.f-newnote');
      if (!input.value.trim()) return;
      try {
        await api('/.netlify/functions/jobs', { method: 'POST', body: JSON.stringify({ action: 'addNote', sheet, jobId, text: input.value.trim() }) });
        await renderMachiningTab(sheet);
      } catch (e) { alert("Couldn't add note: " + e.message); }
    });
  });
}

function enableMachiningDragReorder(sheet) {
  const list = document.getElementById('m-list');
  if (!list) return;
  let dragEl = null;
  list.querySelectorAll('.drag-handle').forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      // See myjobs.js enableDragReorder for why this preventDefault is required.
      e.preventDefault();
      dragEl = handle.closest('.job-card');
      dragEl.setPointerCapture(e.pointerId);
      dragEl.classList.add('dragging');
      document.body.classList.add('is-dragging');
      const onMove = (ev) => {
        ev.preventDefault();
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.job-card');
        if (target && target !== dragEl && target.parentElement === list) {
          const rect = target.getBoundingClientRect();
          list.insertBefore(dragEl, (ev.clientY - rect.top) < rect.height / 2 ? target : target.nextSibling);
        }
      };
      const onUp = async () => {
        dragEl.classList.remove('dragging');
        document.body.classList.remove('is-dragging');
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        const newOrder = Array.from(list.querySelectorAll('.job-card')).map((c) => c.dataset.jobId);
        try {
          await api('/.netlify/functions/jobs', { method: 'POST', body: JSON.stringify({ action: 'reorder', sheet, order: newOrder }) });
          getMachiningState(sheet).data.order = newOrder;
        } catch (e) { alert("Couldn't save order: " + e.message); }
        dragEl = null;
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });
}
