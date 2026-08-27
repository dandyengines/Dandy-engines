// ===== Builds — one editable-or-viewable sheet per person =====
// Renamed from the original single "My Jobs" tab. Every sheet the logged
// -in user can access (their own + anyone in their viewSheets) now shows
// as its own named sidebar tab ("Lou's Builds", "Jake's Builds", etc).
// Tab id doubles as the storage "sheet" key, exactly as before.

const PERSON_NAMES = { jake: 'Jake', mike: 'Mike', frank: 'Frank', sab: 'Sab', lou: 'Lou' };

const buildsStates = {}; // keyed by sheet id: { sortMode, showOnHold, showComplete, data }

function getBuildsState(sheet) {
  if (!buildsStates[sheet]) {
    buildsStates[sheet] = { sortMode: 'custom', showOnHold: true, showComplete: false, data: null };
  }
  return buildsStates[sheet];
}

async function renderMyJobsTab(sheet) {
  const content = document.getElementById('content');
  if (!sheet) {
    content.innerHTML = `<div class="stub-card"><h2>Builds</h2><p>No job sheet is assigned to your login.</p></div>`;
    return;
  }

  content.innerHTML = `<div class="stub-card">Loading…</div>`;
  const state = getBuildsState(sheet);
  let data;
  try {
    data = await api(`/.netlify/functions/jobs?action=sheet&sheet=${sheet}`);
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load jobs: ${escapeHtml(e.message)}</div>`;
    return;
  }
  state.data = data;
  paintMyJobs(sheet);
}

function paintMyJobs(sheet) {
  const content = document.getElementById('content');
  const state = getBuildsState(sheet);
  const { data, sortMode, showOnHold, showComplete } = state;
  const canEdit = data.canEdit;
  const label = (PERSON_NAMES[sheet] || sheet) + "'s Builds";

  let jobs = data.order
    .map((id) => data.jobs.find((j) => j.id === id))
    .filter(Boolean);

  if (!showComplete) jobs = jobs.filter((j) => j.stage !== 'complete');
  if (!showOnHold) jobs = jobs.filter((j) => j.stage !== 'onhold');

  if (sortMode === 'date') {
    jobs = [...jobs].sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
  } else if (sortMode === 'jobnumber') {
    jobs = [...jobs].sort((a, b) => (a.jobNumber || '').localeCompare(b.jobNumber || '', undefined, { numeric: true }));
  } else if (sortMode === 'name') {
    jobs = [...jobs].sort((a, b) => (a.customer || '').localeCompare(b.customer || ''));
  } else if (sortMode === 'status') {
    jobs = [...jobs].sort((a, b) => STAGES.findIndex((s) => s.id === a.stage) - STAGES.findIndex((s) => s.id === b.stage));
  }

  content.innerHTML = `
    <div class="sheet-toolbar">
      <div class="toolbar-group">
        <button class="chip ${sortMode === 'custom' ? 'chip-active' : ''}" data-sort="custom">Custom Order</button>
        <button class="chip ${sortMode === 'date' ? 'chip-active' : ''}" data-sort="date">Date Added</button>
        <button class="chip ${sortMode === 'jobnumber' ? 'chip-active' : ''}" data-sort="jobnumber">Job #</button>
        <button class="chip ${sortMode === 'name' ? 'chip-active' : ''}" data-sort="name">Name</button>
        <button class="chip ${sortMode === 'status' ? 'chip-active' : ''}" data-sort="status">Status</button>
      </div>
      <div class="toolbar-group">
        <label class="chip-toggle"><input type="checkbox" id="toggle-onhold" ${showOnHold ? 'checked' : ''}> Show On Hold</label>
        <label class="chip-toggle"><input type="checkbox" id="toggle-complete" ${showComplete ? 'checked' : ''}> Show Completed</label>
      </div>
      ${canEdit ? '<button id="add-job-btn" class="btn-primary">+ New Job</button>' : ''}
    </div>
    <div id="job-list" class="job-list" data-sheet="${sheet}">
      ${jobs.map((j) => jobCardHTML(j, { editable: canEdit, sheet })).join('') || `<p class="muted-sm">No jobs on ${label}.</p>`}
    </div>
  `;

  wireMyJobsToolbar(sheet);
  wireJobCards(sheet, canEdit);
  if (canEdit && sortMode === 'custom') enableDragReorder(sheet);
}

function wireMyJobsToolbar(sheet) {
  const state = getBuildsState(sheet);
  document.querySelectorAll('[data-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.sortMode = btn.dataset.sort;
      paintMyJobs(sheet);
    });
  });
  document.getElementById('toggle-onhold')?.addEventListener('change', (e) => {
    state.showOnHold = e.target.checked;
    paintMyJobs(sheet);
  });
  document.getElementById('toggle-complete')?.addEventListener('change', (e) => {
    state.showComplete = e.target.checked;
    paintMyJobs(sheet);
  });
  document.getElementById('add-job-btn')?.addEventListener('click', () => showNewJobForm(sheet));
}

function showNewJobForm(sheet) {
  const form = openModal(`
    <h2>New Job</h2>
    <div class="detail-grid">
      <label>Job # <input type="text" class="nf-jobnumber"></label>
      <label>Customer <input type="text" class="nf-customer"></label>
      <label>Customer phone <input type="tel" class="nf-phone"></label>
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
  `);
  document.getElementById('nf-cancel').addEventListener('click', () => closeModal());
  document.getElementById('nf-save').addEventListener('click', async () => {
    const payload = {
      action: 'create',
      sheet,
      jobNumber: form.querySelector('.nf-jobnumber').value,
      customer: form.querySelector('.nf-customer').value,
      customerPhone: form.querySelector('.nf-phone').value,
      engine: form.querySelector('.nf-engine').value,
      stage: form.querySelector('.nf-stage').value,
      expectedFinish: form.querySelector('.nf-finish').value || null,
      notes: form.querySelector('.nf-notes').value,
    };
    try {
      const { job } = await api('/.netlify/functions/jobs', { method: 'POST', body: JSON.stringify(payload) });
      const state = getBuildsState(sheet);
      state.data.jobs.push(job);
      state.data.order.push(job.id);
      closeModal();
      paintMyJobs(sheet);
    } catch (e) {
      alert("Couldn't save job: " + e.message);
    }
  });
}

function wireJobCards(sheet, editable) {
  document.querySelectorAll('.job-card').forEach((card) => {
    const row = card.querySelector('.job-card-row');
    const detail = card.querySelector('.job-card-detail');
    const jobId = card.dataset.jobId;
    row.addEventListener('click', (e) => {
      if (e.target.closest('.drag-handle')) return;
      detail.hidden = !detail.hidden;
      if (!detail.hidden) loadJobPhotos(detail, sheet);
    });

    // Wired regardless of edit access — the person "waiting for" this job
    // may not otherwise be able to edit it, but still needs to be able to
    // mark their own task complete.
    wireWaitingForBlock(detail, sheet, jobId, editable, () => renderMyJobsTab(sheet));

    if (!editable) return;

    card.querySelector('.f-photo-upload')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await uploadJobPhoto(file, sheet, jobId);
        await renderMyJobsTab(sheet);
      } catch (err) { alert("Couldn't upload photo: " + err.message); }
    });

    const save = async (patch) => {
      try {
        await api('/.netlify/functions/jobs', {
          method: 'POST',
          body: JSON.stringify({ action: 'update', sheet, jobId, patch }),
        });
      } catch (e) {
        alert("Couldn't save: " + e.message);
      }
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
      const previousStage = jobId && (getBuildsState(sheet).data.jobs.find((j) => j.id === jobId) || {}).stage;
      await save({ stage: 'complete' });
      await renderMyJobsTab(sheet);
      showUndoToast('Job marked complete.', async () => {
        await api('/.netlify/functions/jobs', { method: 'POST', body: JSON.stringify({ action: 'update', sheet, jobId, patch: { stage: previousStage || 'notstarted' } }) });
        await renderMyJobsTab(sheet);
      });
    });

    card.querySelector('.btn-delete')?.addEventListener('click', async () => {
      if (!confirm('Delete this job? You can undo for a few seconds after.')) return;
      let deletedJob, deletedIndex;
      try {
        ({ deletedJob, deletedIndex } = await api('/.netlify/functions/jobs', { method: 'POST', body: JSON.stringify({ action: 'delete', sheet, jobId }) }));
      } catch (e) { alert("Couldn't delete: " + e.message); return; }
      await renderMyJobsTab(sheet);
      showUndoToast(`Deleted job ${deletedJob.jobNumber || '(no #)'}.`, async () => {
        await api('/.netlify/functions/jobs', { method: 'POST', body: JSON.stringify({ action: 'restore', sheet, job: deletedJob, atIndex: deletedIndex }) });
        await renderMyJobsTab(sheet);
      });
    });

    card.querySelector('.btn-add-note')?.addEventListener('click', async () => {
      const input = card.querySelector('.f-newnote');
      const text = input.value.trim();
      if (!text) return;
      try {
        await api('/.netlify/functions/jobs', {
          method: 'POST',
          body: JSON.stringify({ action: 'addNote', sheet, jobId, text }),
        });
        input.value = '';
        await renderMyJobsTab(sheet); // refresh to show new note + count
      } catch (e) {
        alert("Couldn't add note: " + e.message);
      }
    });
  });
}

// ---------- Drag reorder (pointer-events based, works for mouse + touch) ----------
function enableDragReorder(sheet) {
  const list = document.getElementById('job-list');
  if (!list) return;
  let dragEl = null;

  list.querySelectorAll('.drag-handle').forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      // Prevent default so the browser doesn't start a native text/image
      // selection or drag gesture while the pointer moves — without this,
      // dragging a card on desktop also highlights/"copies" surrounding text.
      e.preventDefault();
      dragEl = handle.closest('.job-card');
      dragEl.setPointerCapture(e.pointerId);
      dragEl.classList.add('dragging');
      document.body.classList.add('is-dragging'); // belt-and-braces: user-select:none while any drag is active

      const onMove = (ev) => {
        ev.preventDefault();
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.job-card');
        if (target && target !== dragEl && target.parentElement === list) {
          const rect = target.getBoundingClientRect();
          const before = (ev.clientY - rect.top) < rect.height / 2;
          list.insertBefore(dragEl, before ? target : target.nextSibling);
        }
      };
      const onUp = async () => {
        dragEl.classList.remove('dragging');
        document.body.classList.remove('is-dragging');
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        const newOrder = Array.from(list.querySelectorAll('.job-card')).map((c) => c.dataset.jobId);
        try {
          await api('/.netlify/functions/jobs', {
            method: 'POST',
            body: JSON.stringify({ action: 'reorder', sheet, order: newOrder }),
          });
          getBuildsState(sheet).data.order = newOrder;
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
