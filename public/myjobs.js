// ===== My Jobs — the logged-in user's own editable sheet =====

let myJobsState = { sortMode: 'custom', showOnHold: true, showComplete: false, data: null };

async function renderMyJobsTab() {
  const content = document.getElementById('content');
  const sheet = session.personSheet;

  if (!sheet) {
    content.innerHTML = `<div class="stub-card"><h2>My Jobs</h2><p>No job sheet is assigned to your login.</p></div>`;
    return;
  }

  content.innerHTML = `<div class="stub-card">Loading…</div>`;
  let data;
  try {
    data = await api(`/.netlify/functions/jobs?action=sheet&sheet=${sheet}`);
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load jobs: ${escapeHtml(e.message)}</div>`;
    return;
  }
  myJobsState.data = data;
  paintMyJobs();
}

function paintMyJobs() {
  const content = document.getElementById('content');
  const { data, sortMode, showOnHold, showComplete } = myJobsState;
  const canEdit = data.canEdit;

  let jobs = data.order
    .map((id) => data.jobs.find((j) => j.id === id))
    .filter(Boolean);

  if (!showComplete) jobs = jobs.filter((j) => j.stage !== 'complete');
  if (!showOnHold) jobs = jobs.filter((j) => j.stage !== 'onhold');

  if (sortMode === 'date') {
    jobs = [...jobs].sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
  }

  content.innerHTML = `
    <div class="sheet-toolbar">
      <div class="toolbar-group">
        <button class="chip ${sortMode === 'custom' ? 'chip-active' : ''}" data-sort="custom">Custom Order</button>
        <button class="chip ${sortMode === 'date' ? 'chip-active' : ''}" data-sort="date">Date Added</button>
      </div>
      <div class="toolbar-group">
        <label class="chip-toggle"><input type="checkbox" id="toggle-onhold" ${showOnHold ? 'checked' : ''}> Show On Hold</label>
        <label class="chip-toggle"><input type="checkbox" id="toggle-complete" ${showComplete ? 'checked' : ''}> Show Completed</label>
      </div>
      ${canEdit ? '<button id="add-job-btn" class="btn-primary">+ New Job</button>' : ''}
    </div>
    <div id="job-list" class="job-list">
      ${jobs.map((j) => jobCardHTML(j, { editable: canEdit, sheet: session.personSheet })).join('') || '<p class="muted-sm">No jobs to show.</p>'}
    </div>
    <div id="new-job-form" class="stub-card" hidden style="margin-top:12px;"></div>
  `;

  wireMyJobsToolbar();
  wireJobCards(canEdit);
  if (canEdit && sortMode === 'custom') enableDragReorder();
}

function wireMyJobsToolbar() {
  document.querySelectorAll('[data-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      myJobsState.sortMode = btn.dataset.sort;
      paintMyJobs();
    });
  });
  document.getElementById('toggle-onhold')?.addEventListener('change', (e) => {
    myJobsState.showOnHold = e.target.checked;
    paintMyJobs();
  });
  document.getElementById('toggle-complete')?.addEventListener('change', (e) => {
    myJobsState.showComplete = e.target.checked;
    paintMyJobs();
  });
  document.getElementById('add-job-btn')?.addEventListener('click', showNewJobForm);
}

function showNewJobForm() {
  const form = document.getElementById('new-job-form');
  form.hidden = false;
  form.innerHTML = `
    <h2>New Job</h2>
    <div class="detail-grid">
      <label>Job # <input type="text" class="nf-jobnumber"></label>
      <label>Customer <input type="text" class="nf-customer"></label>
      <label>Engine <input type="text" class="nf-engine"></label>
      <label>Stage
        <select class="nf-stage">
          ${STAGES.filter((s) => s.id !== 'complete').map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}
        </select>
      </label>
      <label>Expected finish <input type="date" class="nf-finish"></label>
    </div>
    <label style="display:block;margin-top:8px;">Initial note <textarea class="nf-notes" rows="2" style="width:100%;"></textarea></label>
    <div style="margin-top:10px;display:flex;gap:8px;">
      <button id="nf-save" class="btn-primary">Save</button>
      <button id="nf-cancel">Cancel</button>
    </div>
  `;
  document.getElementById('nf-cancel').addEventListener('click', () => { form.hidden = true; });
  document.getElementById('nf-save').addEventListener('click', async () => {
    const payload = {
      action: 'create',
      sheet: session.personSheet,
      jobNumber: form.querySelector('.nf-jobnumber').value,
      customer: form.querySelector('.nf-customer').value,
      engine: form.querySelector('.nf-engine').value,
      stage: form.querySelector('.nf-stage').value,
      expectedFinish: form.querySelector('.nf-finish').value || null,
      notes: form.querySelector('.nf-notes').value,
    };
    try {
      const { job } = await api('/.netlify/functions/jobs', { method: 'POST', body: JSON.stringify(payload) });
      myJobsState.data.jobs.push(job);
      myJobsState.data.order.push(job.id);
      paintMyJobs();
    } catch (e) {
      alert("Couldn't save job: " + e.message);
    }
  });
}

function wireJobCards(editable) {
  document.querySelectorAll('.job-card').forEach((card) => {
    const row = card.querySelector('.job-card-row');
    const detail = card.querySelector('.job-card-detail');
    row.addEventListener('click', (e) => {
      if (e.target.closest('.drag-handle')) return;
      detail.hidden = !detail.hidden;
      if (!detail.hidden) loadJobPhotos(detail, session.personSheet);
    });

    if (!editable) return;
    const jobId = card.dataset.jobId;

    card.querySelector('.f-photo-upload')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await uploadJobPhoto(file, session.personSheet, jobId);
        await renderMyJobsTab();
      } catch (err) { alert("Couldn't upload photo: " + err.message); }
    });

    const save = async (patch) => {
      try {
        await api('/.netlify/functions/jobs', {
          method: 'POST',
          body: JSON.stringify({ action: 'update', sheet: session.personSheet, jobId, patch }),
        });
      } catch (e) {
        alert("Couldn't save: " + e.message);
      }
    };

    card.querySelector('.f-stage')?.addEventListener('change', (e) => save({ stage: e.target.value }));
    card.querySelector('.f-urgent')?.addEventListener('change', (e) => save({ urgent: e.target.checked }));
    card.querySelector('.f-finish')?.addEventListener('change', (e) => save({ expectedFinish: e.target.value || null }));

    card.querySelector('.btn-add-note')?.addEventListener('click', async () => {
      const input = card.querySelector('.f-newnote');
      const text = input.value.trim();
      if (!text) return;
      try {
        await api('/.netlify/functions/jobs', {
          method: 'POST',
          body: JSON.stringify({ action: 'addNote', sheet: session.personSheet, jobId, text }),
        });
        input.value = '';
        await renderMyJobsTab(); // refresh to show new note + count
      } catch (e) {
        alert("Couldn't add note: " + e.message);
      }
    });
  });
}

// ---------- Drag reorder (pointer-events based, works for mouse + touch) ----------
function enableDragReorder() {
  const list = document.getElementById('job-list');
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
          const before = (ev.clientY - rect.top) < rect.height / 2;
          list.insertBefore(dragEl, before ? target : target.nextSibling);
        }
      };
      const onUp = async () => {
        dragEl.classList.remove('dragging');
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        const newOrder = Array.from(list.querySelectorAll('.job-card')).map((c) => c.dataset.jobId);
        try {
          await api('/.netlify/functions/jobs', {
            method: 'POST',
            body: JSON.stringify({ action: 'reorder', sheet: session.personSheet, order: newOrder }),
          });
          myJobsState.data.order = newOrder;
        } catch (e) {
          alert("Couldn't save new order: " + e.message);
        }
        dragEl = null;
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });
}
