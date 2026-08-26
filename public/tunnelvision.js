// ===== Tunnel Vision — Jake-only job-cost directory =====

let tvState = { sortMode: 'custom', data: null };
const TV_BADGE_LABEL = { grey: 'Not Started', blue: 'In Progress', red: 'Waiting on Parts', green: 'Complete' };

async function renderTunnelVisionTab() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="stub-card">Loading…</div>`;
  let data;
  try {
    data = await api('/.netlify/functions/tunnelvision');
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load: ${escapeHtml(e.message)}</div>`;
    return;
  }
  tvState.data = data;
  paintTV();
}

function paintTV() {
  const content = document.getElementById('content');
  const { data, sortMode } = tvState;
  let jobs = [...data.jobs];
  if (sortMode === 'date') jobs.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));

  const totalValue = jobs.reduce((s, j) => s + (j.value || 0), 0);
  const totalPaid = jobs.reduce((s, j) => s + (j.paid || 0), 0);
  // "Jobs" tile counts only active (not-yet-complete) jobs — completed TV
  // jobs (badge === 'green') are excluded from this total.
  const activeJobsCount = jobs.filter((j) => j.badge !== 'green').length;

  content.innerHTML = `
    <div class="tv-summary">
      <div><span class="tv-summary-num">${activeJobsCount}</span><span class="tv-summary-lbl">Jobs</span></div>
      <div><span class="tv-summary-num">$${totalValue.toFixed(0)}</span><span class="tv-summary-lbl">Total Value</span></div>
      <div><span class="tv-summary-num">$${totalPaid.toFixed(0)}</span><span class="tv-summary-lbl">Total Paid</span></div>
      <div><span class="tv-summary-num">$${(totalValue - totalPaid).toFixed(0)}</span><span class="tv-summary-lbl">Owing</span></div>
    </div>
    <div class="sheet-toolbar">
      <div class="toolbar-group">
        <button class="chip ${sortMode === 'custom' ? 'chip-active' : ''}" data-tvsort="custom">Custom Order</button>
        <button class="chip ${sortMode === 'date' ? 'chip-active' : ''}" data-tvsort="date">Date Added</button>
      </div>
      <button id="tv-add-btn" class="btn-primary">+ New TV Job</button>
    </div>
    <div id="tv-list" class="job-list">${jobs.map(tvCardHTML).join('') || '<p class="muted-sm">No jobs yet.</p>'}</div>
    <div id="tv-new-form" class="stub-card" hidden style="margin-top:12px;"></div>
  `;

  document.querySelectorAll('[data-tvsort]').forEach((btn) =>
    btn.addEventListener('click', () => { tvState.sortMode = btn.dataset.tvsort; paintTV(); })
  );
  document.getElementById('tv-add-btn').addEventListener('click', showTVNewForm);
  wireTVCards();
}

function tvCardHTML(job) {
  const opts = tvState.data.statusOptions;
  const owing = (job.value || 0) - (job.paid || 0);
  return `
  <div class="job-card" data-tv-id="${job.id}">
    <div class="job-card-row">
      <div class="job-card-main">
        <div class="job-card-title"><strong>${escapeHtml(job.tvNumber)}</strong> ${escapeHtml(job.customer || '')}</div>
        <div class="job-card-sub">${escapeHtml(job.engine || '')}</div>
      </div>
      <div class="job-card-meta">
        <span class="stage-badge tv-badge-${job.badge}">${TV_BADGE_LABEL[job.badge]}</span>
        <span class="muted-sm">Owing $${owing.toFixed(0)}</span>
      </div>
    </div>
    <div class="job-card-detail" hidden>
      <div class="detail-grid">
        <label>TV # <input type="text" class="tv-f-tvnumber" value="${escapeHtml(job.tvNumber || '')}"></label>
        <label>Customer <input type="text" class="tv-f-customer" value="${escapeHtml(job.customer || '')}"></label>
        <label>Engine <input type="text" class="tv-f-engine" value="${escapeHtml(job.engine || '')}"></label>
      </div>
      <div class="tv-components" style="margin-top:12px;">
        ${tvComponentRow('block', 'Block', job.block.status, opts.BLOCK_STATUSES, opts.LABELS)}
        ${tvComponentRow('head', 'Cylinder Head', job.head.status, opts.HEAD_STATUSES, opts.LABELS)}
        ${tvComponentRow('rods', 'Conrods', job.rods.status, opts.RODS_STATUSES, opts.LABELS)}
        ${tvComponentRow('crank', 'Crankshaft', job.crank.status, opts.CRANK_STATUSES, opts.LABELS)}
      </div>
      <div class="detail-grid" style="margin-top:12px;">
        <label>Value $ <input type="number" class="tv-f-value" value="${job.value || 0}"></label>
        <label>Paid $ <input type="number" class="tv-f-paid" value="${job.paid || 0}"></label>
      </div>
      <div class="notes-block">
        <h4>Notes</h4>
        <div class="notes-list">
          ${(job.notes || []).map((n) => `<div class="note-line"><span class="note-time">${formatDate(n.timestamp)} — ${escapeHtml(n.author)}${n.auto ? ' (auto)' : ''}:</span> ${escapeHtml(n.text)}</div>`).join('') || '<p class="muted-sm">No notes yet.</p>'}
        </div>
        <div class="note-add">
          <input type="text" class="tv-f-newnote" placeholder="Add a note...">
          <button class="tv-btn-addnote">Add</button>
        </div>
      </div>
      <div class="job-actions-row">
        <button class="tv-btn-complete">✓ Complete</button>
        <button class="tv-btn-delete">🗑 Delete</button>
      </div>
    </div>
  </div>`;
}

function tvComponentRow(key, label, current, options, labels) {
  return `
    <div class="tv-comp-row">
      <span class="tv-comp-label">${label}</span>
      <select class="tv-f-comp" data-comp="${key}">
        ${options.map((o) => `<option value="${o}" ${o === current ? 'selected' : ''}>${labels[o]}</option>`).join('')}
      </select>
    </div>`;
}

function wireTVCards() {
  document.querySelectorAll('#tv-list .job-card').forEach((card) => {
    const row = card.querySelector('.job-card-row');
    const detail = card.querySelector('.job-card-detail');
    row.addEventListener('click', () => { detail.hidden = !detail.hidden; });

    const tvId = card.dataset.tvId;

    const saveDetails = async () => {
      try {
        const { job } = await api('/.netlify/functions/tunnelvision', {
          method: 'POST',
          body: JSON.stringify({
            action: 'updateDetails', jobId: tvId,
            patch: {
              tvNumber: card.querySelector('.tv-f-tvnumber').value,
              customer: card.querySelector('.tv-f-customer').value,
              engine: card.querySelector('.tv-f-engine').value,
            },
          }),
        });
        Object.assign(tvState.data.jobs.find((j) => j.id === tvId), job);
        paintTV();
      } catch (err) { alert("Couldn't save: " + err.message); }
    };
    card.querySelector('.tv-f-tvnumber')?.addEventListener('click', (e) => e.stopPropagation());
    card.querySelector('.tv-f-customer')?.addEventListener('click', (e) => e.stopPropagation());
    card.querySelector('.tv-f-engine')?.addEventListener('click', (e) => e.stopPropagation());
    card.querySelector('.tv-f-tvnumber')?.addEventListener('change', saveDetails);
    card.querySelector('.tv-f-customer')?.addEventListener('change', saveDetails);
    card.querySelector('.tv-f-engine')?.addEventListener('change', saveDetails);

    card.querySelector('.tv-btn-complete')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      let previousStatuses;
      try {
        ({ previousStatuses } = await api('/.netlify/functions/tunnelvision', { method: 'POST', body: JSON.stringify({ action: 'complete', jobId: tvId }) }));
      } catch (err) { alert("Couldn't mark complete: " + err.message); return; }
      await renderTunnelVisionTab();
      showUndoToast('TV job marked complete.', async () => {
        await api('/.netlify/functions/tunnelvision', { method: 'POST', body: JSON.stringify({ action: 'setComponents', jobId: tvId, statuses: previousStatuses }) });
        await renderTunnelVisionTab();
      });
    });

    card.querySelector('.tv-btn-delete')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this TV job? You can undo for a few seconds after.')) return;
      let removed, removedIndex;
      try {
        ({ removed, removedIndex } = await api('/.netlify/functions/tunnelvision', { method: 'POST', body: JSON.stringify({ action: 'delete', jobId: tvId }) }));
      } catch (err) { alert("Couldn't delete: " + err.message); return; }
      tvState.data.jobs = tvState.data.jobs.filter((j) => j.id !== tvId);
      paintTV();
      showUndoToast(`Deleted TV job ${removed.tvNumber || '(no #)'}.`, async () => {
        await api('/.netlify/functions/tunnelvision', { method: 'POST', body: JSON.stringify({ action: 'restore', job: removed, atIndex: removedIndex }) });
        await renderTunnelVisionTab();
      });
    });

    card.querySelectorAll('.tv-f-comp').forEach((sel) => {
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', async (e) => {
        try {
          const { job } = await api('/.netlify/functions/tunnelvision', {
            method: 'POST',
            body: JSON.stringify({ action: 'updateComponent', jobId: tvId, component: sel.dataset.comp, status: e.target.value }),
          });
          Object.assign(tvState.data.jobs.find((j) => j.id === tvId), job);
          paintTV();
        } catch (err) { alert("Couldn't save: " + err.message); }
      });
    });

    card.querySelector('.tv-f-value')?.addEventListener('click', (e) => e.stopPropagation());
    card.querySelector('.tv-f-paid')?.addEventListener('click', (e) => e.stopPropagation());
    const saveFinance = async () => {
      const value = card.querySelector('.tv-f-value').value;
      const paid = card.querySelector('.tv-f-paid').value;
      try {
        const { job } = await api('/.netlify/functions/tunnelvision', {
          method: 'POST', body: JSON.stringify({ action: 'updateFinance', jobId: tvId, value, paid }),
        });
        Object.assign(tvState.data.jobs.find((j) => j.id === tvId), job);
        paintTV();
      } catch (err) { alert("Couldn't save: " + err.message); }
    };
    card.querySelector('.tv-f-value')?.addEventListener('change', saveFinance);
    card.querySelector('.tv-f-paid')?.addEventListener('change', saveFinance);

    card.querySelector('.tv-btn-addnote')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const input = card.querySelector('.tv-f-newnote');
      if (!input.value.trim()) return;
      try {
        const { job } = await api('/.netlify/functions/tunnelvision', {
          method: 'POST', body: JSON.stringify({ action: 'addNote', jobId: tvId, text: input.value.trim() }),
        });
        Object.assign(tvState.data.jobs.find((j) => j.id === tvId), job);
        paintTV();
      } catch (err) { alert("Couldn't add note: " + err.message); }
    });
  });
}

function showTVNewForm() {
  const form = document.getElementById('tv-new-form');
  form.hidden = false;
  form.innerHTML = `
    <h2>New Tunnel Vision Job</h2>
    <div class="detail-grid">
      <label>TV # <input type="text" class="tvnf-tvnumber"></label>
      <label>Customer <input type="text" class="tvnf-customer"></label>
      <label>Engine <input type="text" class="tvnf-engine"></label>
      <label>Value $ <input type="number" class="tvnf-value" value="0"></label>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;">
      <button id="tvnf-save" class="btn-primary">Save</button>
      <button id="tvnf-cancel">Cancel</button>
    </div>
  `;
  document.getElementById('tvnf-cancel').addEventListener('click', () => { form.hidden = true; });
  document.getElementById('tvnf-save').addEventListener('click', async () => {
    try {
      const { job } = await api('/.netlify/functions/tunnelvision', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          tvNumber: form.querySelector('.tvnf-tvnumber').value,
          customer: form.querySelector('.tvnf-customer').value,
          engine: form.querySelector('.tvnf-engine').value,
          value: form.querySelector('.tvnf-value').value,
        }),
      });
      tvState.data.jobs.unshift(job);
      paintTV();
    } catch (e) { alert("Couldn't save: " + e.message); }
  });
}
