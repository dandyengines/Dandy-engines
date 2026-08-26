// ===== Machining — Jake's own private sheet =====

let machiningState = { sortMode: 'custom', showOnHold: true, showComplete: false, data: null };
const MACHINING_SHEET = 'machining';

async function renderMachiningTab() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="stub-card">Loading…</div>`;
  let data;
  try {
    data = await api(`/.netlify/functions/jobs?action=sheet&sheet=${MACHINING_SHEET}`);
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load: ${escapeHtml(e.message)}</div>`;
    return;
  }
  machiningState.data = data;
  paintMachining();
}

function paintMachining() {
  const content = document.getElementById('content');
  const { data, sortMode, showOnHold, showComplete } = machiningState;

  let jobs = data.order.map((id) => data.jobs.find((j) => j.id === id)).filter(Boolean);
  if (!showComplete) jobs = jobs.filter((j) => j.stage !== 'complete');
  if (!showOnHold) jobs = jobs.filter((j) => j.stage !== 'onhold');
  if (sortMode === 'date') jobs = [...jobs].sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));

  content.innerHTML = `
    <div class="sheet-toolbar">
      <div class="toolbar-group">
        <button class="chip ${sortMode === 'custom' ? 'chip-active' : ''}" data-msort="custom">Custom Order</button>
        <button class="chip ${sortMode === 'date' ? 'chip-active' : ''}" data-msort="date">Date Added</button>
      </div>
      <div class="toolbar-group">
        <label class="chip-toggle"><input type="checkbox" id="m-toggle-onhold" ${showOnHold ? 'checked' : ''}> Show On Hold</label>
        <label class="chip-toggle"><input type="checkbox" id="m-toggle-complete" ${showComplete ? 'checked' : ''}> Show Completed</label>
      </div>
      <button id="m-add-btn" class="btn-primary">+ New Job</button>
    </div>
    <div id="m-list" class="job-list">${jobs.map((j) => jobCardHTML(j, { editable: true, sheet: MACHINING_SHEET })).join('') || '<p class="muted-sm">No jobs to show.</p>'}</div>
    <div id="m-new-form" class="stub-card" hidden style="margin-top:12px;"></div>
  `;

  document.querySelectorAll('[data-msort]').forEach((b) => b.addEventListener('click', () => { machiningState.sortMode = b.dataset.msort; paintMachining(); }));
  document.getElementById('m-toggle-onhold').addEventListener('change', (e) => { machiningState.showOnHold = e.target.checked; paintMachining(); });
  document.getElementById('m-toggle-complete').addEventListener('change', (e) => { machiningState.showComplete = e.target.checked; paintMachining(); });
  document.getElementById('m-add-btn').addEventListener('click', showMachiningNewForm);
  wireMachiningCards();
  if (sortMode === 'custom') enableMachiningDragReorder();
}

function showMachiningNewForm() {
  const form = document.getElementById('m-new-form');
  form.hidden = false;
  form.innerHTML = `
    <h2>New Machining Job</h2>
    <div class="detail-grid">
      <label>Job # <input type="text" class="mnf-jobnumber"></label>
      <label>Customer <input type="text" class="mnf-customer"></label>
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
  `;
  document.getElementById('mnf-cancel').addEventListener('click', () => { form.hidden = true; });
  document.getElementById('mnf-save').addEventListener('click', async () => {
    const payload = {
      action: 'create', sheet: MACHINING_SHEET,
      jobNumber: form.querySelector('.mnf-jobnumber').value,
      customer: form.querySelector('.mnf-customer').value,
      engine: form.querySelector('.mnf-engine').value,
      stage: form.querySelector('.mnf-stage').value,
      expectedFinish: form.querySelector('.mnf-finish').value || null,
      notes: form.querySelector('.mnf-notes').value,
    };
    try {
      const { job } = await api('/.netlify/functions/jobs', { method: 'POST', body: JSON.stringify(payload) });
      machiningState.data.jobs.push(job);
      machiningState.data.order.push(job.id);
      paintMachining();
    } catch (e) { alert("Couldn't save: " + e.message); }
  });
}

function wireMachiningCards() {
  document.querySelectorAll('#m-list .job-card').forEach((card) => {
    const row = card.querySelector('.job-card-row');
    const detail = card.querySelector('.job-card-detail');
    row.addEventListener('click', (e) => {
      if (!e.target.closest('.drag-handle')) {
        detail.hidden = !detail.hidden;
        if (!detail.hidden) loadJobPhotos(detail, MACHINING_SHEET);
      }
    });

    const jobId = card.dataset.jobId;
    card.querySelector('.f-photo-upload')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await uploadJobPhoto(file, MACHINING_SHEET, jobId);
        await renderMachiningTab();
      } catch (err) { alert("Couldn't upload photo: " + err.message); }
    });
    const save = async (patch) => {
      try { await api('/.netlify/functions/jobs', { method: 'POST', body: JSON.stringify({ action: 'update', sheet: MACHINING_SHEET, jobId, patch }) }); }
      catch (e) { alert("Couldn't save: " + e.message); }
    };
    card.querySelector('.f-stage')?.addEventListener('change', (e) => save({ stage: e.target.value }));
    card.querySelector('.f-urgent')?.addEventListener('change', (e) => save({ urgent: e.target.checked }));
    card.querySelector('.f-finish')?.addEventListener('change', (e) => save({ expectedFinish: e.target.value || null }));

    card.querySelector('.btn-add-note')?.addEventListener('click', async () => {
      const input = card.querySelector('.f-newnote');
      if (!input.value.trim()) return;
      try {
        await api('/.netlify/functions/jobs', { method: 'POST', body: JSON.stringify({ action: 'addNote', sheet: MACHINING_SHEET, jobId, text: input.value.trim() }) });
        await renderMachiningTab();
      } catch (e) { alert("Couldn't add note: " + e.message); }
    });
  });
}

function enableMachiningDragReorder() {
  const list = document.getElementById('m-list');
  if (!list) return;
  let dragEl = null;
  list.querySelectorAll('.drag-handle').forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      dragEl = handle.closest('.job-card');
      dragEl.setPointerCapture(e.pointerId);
      dragEl.classList.add('dragging');
      const onMove = (ev) => {
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.job-card');
        if (target && target !== dragEl && target.parentElement === list) {
          const rect = target.getBoundingClientRect();
          list.insertBefore(dragEl, (ev.clientY - rect.top) < rect.height / 2 ? target : target.nextSibling);
        }
      };
      const onUp = async () => {
        dragEl.classList.remove('dragging');
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        const newOrder = Array.from(list.querySelectorAll('.job-card')).map((c) => c.dataset.jobId);
        try {
          await api('/.netlify/functions/jobs', { method: 'POST', body: JSON.stringify({ action: 'reorder', sheet: MACHINING_SHEET, order: newOrder }) });
          machiningState.data.order = newOrder;
        } catch (e) { alert("Couldn't save order: " + e.message); }
        dragEl = null;
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });
}
