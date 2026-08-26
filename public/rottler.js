// ===== Rottler — directory: input form + searchable/sortable list =====

let rottlerState = { entries: [], canInput: false, linkedMatch: null, sortMode: 'date', raceHoneOnly: false };

async function renderRottlerTab() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="stub-card">Loading…</div>`;
  let data;
  try {
    data = await api('/.netlify/functions/rottler?action=list');
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load: ${escapeHtml(e.message)}</div>`;
    return;
  }
  rottlerState.entries = data.entries;
  rottlerState.canInput = data.canInput;
  paintRottler();
}

function paintRottler() {
  const content = document.getElementById('content');
  content.innerHTML = `
    ${rottlerState.canInput ? rottlerInputFormHTML() : ''}
    <h2 class="section-title">Directory</h2>
    <div class="sheet-toolbar">
      <div class="toolbar-group">
        <button class="chip ${rottlerState.sortMode === 'date' ? 'chip-active' : ''}" data-rsort="date">Most Recent</button>
        <button class="chip ${rottlerState.sortMode === 'jobnumber' ? 'chip-active' : ''}" data-rsort="jobnumber">Job #</button>
        <button class="chip ${rottlerState.sortMode === 'name' ? 'chip-active' : ''}" data-rsort="name">Name</button>
        <button class="chip ${rottlerState.sortMode === 'engine' ? 'chip-active' : ''}" data-rsort="engine">Engine</button>
      </div>
      <div class="toolbar-group">
        <label class="chip-toggle"><input type="checkbox" id="rottler-racehone-only" ${rottlerState.raceHoneOnly ? 'checked' : ''}> Race Hone only</label>
      </div>
    </div>
    <input type="text" id="rottler-search" class="search-input" placeholder="Search job #, customer, engine…">
    <div id="rottler-list" class="job-list"></div>
  `;
  if (rottlerState.canInput) wireRottlerForm();
  paintRottlerList();
  document.getElementById('rottler-search').addEventListener('input', paintRottlerList);
  document.querySelectorAll('[data-rsort]').forEach((b) => b.addEventListener('click', () => {
    rottlerState.sortMode = b.dataset.rsort;
    paintRottler();
  }));
  document.getElementById('rottler-racehone-only').addEventListener('change', (e) => {
    rottlerState.raceHoneOnly = e.target.checked;
    paintRottlerList();
  });
}

function rottlerInputFormHTML() {
  return `
    <div class="stub-card" style="margin-bottom:20px;">
      <h2>New Job</h2>
      <div class="detail-grid">
        <label style="position:relative;">Job # <input type="text" id="rf-jobnumber" autocomplete="off">
          <div id="rf-jobnumber-suggestions" class="autocomplete-dropdown" hidden></div>
        </label>
        <label>Person Responsible
          <select id="rf-person">
            <option value="jake">Jake</option><option value="mike">Mike</option>
            <option value="lou">Lou</option><option value="sab">Sab</option><option value="frank">Frank</option>
          </select>
        </label>
        <label>Customer Name <input type="text" id="rf-customer"></label>
        <label>Engine <input type="text" id="rf-engine"></label>
        <label>Piston OD <input type="number" step="0.0001" id="rf-pistonod"></label>
        <label>Bore Size <input type="number" step="0.0001" id="rf-boresize"></label>
        <label>Clearance (auto) <input type="text" id="rf-clearance" disabled></label>
      </div>
      <p id="rf-lookup-msg" class="muted-sm" style="margin-top:8px;" hidden></p>

      <div class="rottler-toggle-row" style="margin-top:14px;">
        <label class="urgent-toggle"><input type="checkbox" id="rf-torque-on"> Torque Plate</label>
        <input type="text" id="rf-torque-value" placeholder="Torque value" style="display:none;max-width:160px;" class="rf-inline-input">
      </div>
      <div class="rottler-toggle-row">
        <label class="urgent-toggle"><input type="checkbox" id="rf-race-on"> Race Hone</label>
      </div>
      <div id="rf-race-fields" class="detail-grid" style="display:none;margin-top:6px;">
        <label>RPK <input type="text" id="rf-rpk"></label>
        <label>RK <input type="text" id="rf-rk"></label>
        <label>RVK <input type="text" id="rf-rvk"></label>
        <label>Angle <input type="text" id="rf-angle"></label>
        <label>Stones used <input type="text" id="rf-stonesused"></label>
      </div>

      <label style="display:block;margin-top:10px;">Notes<textarea id="rf-notes" rows="2" style="width:100%;"></textarea></label>
      <button id="rf-save" class="btn-primary" style="margin-top:10px;">Save Job</button>
    </div>
  `;
}

function sheetDisplayLabel(sheet) {
  const machiningLabels = { machining: "Jake's Machining", machining_lou: "Lou's Machining", machining_sab: "Sab's Machining", machining_mike: "Mike's Machining" };
  if (machiningLabels[sheet]) return machiningLabels[sheet];
  return `${PERSON_NAMES[sheet] || sheet}'s Builds`;
}

function wireRottlerForm() {
  const jobNumberInput = document.getElementById('rf-jobnumber');
  const suggestionsBox = document.getElementById('rf-jobnumber-suggestions');
  const pistonOD = document.getElementById('rf-pistonod');
  const boreSize = document.getElementById('rf-boresize');
  const clearance = document.getElementById('rf-clearance');
  const torqueOn = document.getElementById('rf-torque-on');
  const torqueValue = document.getElementById('rf-torque-value');
  const raceOn = document.getElementById('rf-race-on');
  const raceFields = document.getElementById('rf-race-fields');
  const lookupMsg = document.getElementById('rf-lookup-msg');

  const recalcClearance = () => {
    const p = parseFloat(pistonOD.value), b = parseFloat(boreSize.value);
    clearance.value = (!isNaN(p) && !isNaN(b)) ? (b - p).toFixed(4) : '';
  };
  pistonOD.addEventListener('input', recalcClearance);
  boreSize.addEventListener('input', recalcClearance);

  torqueOn.addEventListener('change', () => { torqueValue.style.display = torqueOn.checked ? 'inline-block' : 'none'; });
  raceOn.addEventListener('change', () => { raceFields.style.display = raceOn.checked ? 'grid' : 'none'; });

  // Live autocomplete-style suggestions as the job # is typed — searches
  // across Builds AND Machining, click-to-populate customer/engine.
  let autocompleteTimer;
  jobNumberInput.addEventListener('input', () => {
    clearTimeout(autocompleteTimer);
    rottlerState.linkedMatch = null;
    lookupMsg.hidden = true;
    const q = jobNumberInput.value.trim();
    if (!q) { suggestionsBox.hidden = true; return; }
    autocompleteTimer = setTimeout(async () => {
      try {
        const { suggestions } = await api(`/.netlify/functions/rottler?action=autocomplete&q=${encodeURIComponent(q)}`);
        if (!suggestions.length) { suggestionsBox.hidden = true; return; }
        suggestionsBox.hidden = false;
        suggestionsBox.innerHTML = suggestions.map((s, i) => `
          <button type="button" class="autocomplete-row" data-idx="${i}">
            <strong>${escapeHtml(s.jobNumber || '—')}</strong> ${escapeHtml(s.customer || '')} — ${escapeHtml(s.engine || '')}
            <span class="muted-sm">(${escapeHtml(sheetDisplayLabel(s.sheet))})</span>
          </button>`).join('');
        suggestionsBox.querySelectorAll('.autocomplete-row').forEach((row) => {
          row.addEventListener('click', () => {
            const s = suggestions[row.dataset.idx];
            jobNumberInput.value = s.jobNumber;
            document.getElementById('rf-customer').value = s.customer || '';
            document.getElementById('rf-engine').value = s.engine || '';
            rottlerState.linkedMatch = { sheet: s.sheet, jobId: s.jobId, customer: s.customer, engine: s.engine };
            suggestionsBox.hidden = true;
            lookupMsg.hidden = false;
            lookupMsg.innerHTML = `✓ Linked to ${escapeHtml(s.customer || '')}'s job (${escapeHtml(sheetDisplayLabel(s.sheet))}).`;
          });
        });
      } catch { /* suggestions are a convenience, not required */ }
    }, 200);
  });
  document.addEventListener('click', (e) => {
    if (!suggestionsBox.contains(e.target) && e.target !== jobNumberInput) suggestionsBox.hidden = true;
  });

  document.getElementById('rf-save').addEventListener('click', async () => {
    const isRedo = !!rottlerState.pendingRedoOfId;
    const payload = {
      action: isRedo ? 'redo' : 'create',
      redoOfId: rottlerState.pendingRedoOfId || null,
      jobNumber: jobNumberInput.value,
      personResponsible: document.getElementById('rf-person').value,
      customer: document.getElementById('rf-customer').value,
      engine: document.getElementById('rf-engine').value,
      pistonOD: pistonOD.value,
      boreSize: boreSize.value,
      torquePlate: { on: torqueOn.checked, value: torqueValue.value },
      raceHone: raceOn.checked ? {
        on: true,
        rpk: document.getElementById('rf-rpk').value,
        rk: document.getElementById('rf-rk').value,
        rvk: document.getElementById('rf-rvk').value,
        angle: document.getElementById('rf-angle').value,
        stonesUsed: document.getElementById('rf-stonesused').value,
      } : { on: false },
      notes: document.getElementById('rf-notes').value,
    };
    if (rottlerState.linkedMatch) {
      payload.linkedSheet = rottlerState.linkedMatch.sheet;
      payload.linkedJobId = rottlerState.linkedMatch.jobId;
    }
    try {
      const { entry } = await api('/.netlify/functions/rottler', { method: 'POST', body: JSON.stringify(payload) });
      rottlerState.entries.unshift(entry);
      rottlerState.linkedMatch = null;
      rottlerState.pendingRedoOfId = null;
      paintRottler();
    } catch (e) { alert("Couldn't save: " + e.message); }
  });
}

function paintRottlerList() {
  const list = document.getElementById('rottler-list');
  const q = (document.getElementById('rottler-search')?.value || '').trim().toLowerCase();
  let filtered = rottlerState.entries.filter((e) =>
    !q || [e.jobNumber, e.customer, e.engine].some((f) => (f || '').toLowerCase().includes(q))
  );
  if (rottlerState.raceHoneOnly) filtered = filtered.filter((e) => e.raceHone?.on);

  if (rottlerState.sortMode === 'jobnumber') {
    filtered = [...filtered].sort((a, b) => (a.jobNumber || '').localeCompare(b.jobNumber || '', undefined, { numeric: true }));
  } else if (rottlerState.sortMode === 'name') {
    filtered = [...filtered].sort((a, b) => (a.customer || '').localeCompare(b.customer || ''));
  } else if (rottlerState.sortMode === 'engine') {
    filtered = [...filtered].sort((a, b) => (a.engine || '').localeCompare(b.engine || ''));
  } else {
    // Default and explicit "Most Recent": always sort by date descending —
    // never rely on storage/array order, since legacy-imported entries and
    // newly-created ones weren't in a consistent order otherwise.
    filtered = [...filtered].sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
  }

  list.innerHTML = filtered.map(rottlerRowHTML).join('') || '<p class="muted-sm">No entries found.</p>';
  wireRottlerListInteractions();
  wireRottlerRedoButtons();
}

function rottlerRowHTML(e) {
  return `
  <div class="job-card" data-entry-id="${e.id}">
    <div class="job-card-row">
      <div class="job-card-main">
        <div class="job-card-title"><strong>${escapeHtml(e.jobNumber || '—')}</strong> ${escapeHtml(e.customer || '')} ${e.redoOf ? '<span class="muted-sm">(redo)</span>' : ''} ${e.notes ? '<span class="note-count">📝</span>' : ''}</div>
        <div class="job-card-sub">${escapeHtml(e.engine || '')} · Piston OD ${e.pistonOD ?? '—'} · Bore ${e.boreSize ?? '—'} · Clearance ${e.clearance ?? '—'}${e.raceHone?.on ? ' · Race Hone' : ''}${e.torquePlate?.on ? ' · Torque Plate' : ''}</div>
      </div>
      <div class="job-card-meta">
        <span class="muted-sm">${formatDate(e.dateAdded)}</span>
        <span class="muted-sm">${escapeHtml(e.enteredBy || '')}</span>
        ${rottlerState.canInput ? `
          <button class="rottler-redo-btn" data-redo-id="${e.id}">↻ Redo</button>
          <button class="rottler-edit-btn">✎ Edit</button>
          <button class="rottler-delete-btn">🗑 Delete</button>
        ` : ''}
      </div>
    </div>
    <div class="job-card-detail" hidden>
      <div class="detail-grid">
        <div><span class="muted-sm">Job #</span><br>${escapeHtml(e.jobNumber || '—')}</div>
        <div><span class="muted-sm">Customer</span><br>${escapeHtml(e.customer || '—')}</div>
        <div><span class="muted-sm">Engine</span><br>${escapeHtml(e.engine || '—')}</div>
        <div><span class="muted-sm">Piston OD</span><br>${e.pistonOD ?? '—'}</div>
        <div><span class="muted-sm">Bore Size</span><br>${e.boreSize ?? '—'}</div>
        <div><span class="muted-sm">Clearance</span><br>${e.clearance ?? '—'}</div>
        <div><span class="muted-sm">Torque Plate</span><br>${e.torquePlate?.on ? `Yes (${escapeHtml(e.torquePlate.value || '—')})` : 'No'}</div>
        <div><span class="muted-sm">Race Hone</span><br>${e.raceHone?.on
          ? `RPK ${escapeHtml(e.raceHone.rpk || '—')}, RK ${escapeHtml(e.raceHone.rk || '—')}, RVK ${escapeHtml(e.raceHone.rvk || '—')}, Angle ${escapeHtml(e.raceHone.angle || '—')}, Stones used ${escapeHtml(e.raceHone.stonesUsed || '—')}`
          : 'No'}</div>
        <div><span class="muted-sm">Entered By</span><br>${escapeHtml(e.enteredBy || '—')}</div>
        <div><span class="muted-sm">Date</span><br>${formatDate(e.dateAdded)}</div>
      </div>
      ${e.notes ? `<h4 style="margin-top:12px;">Notes</h4><p class="muted-sm">${escapeHtml(e.notes)}</p>` : ''}
    </div>
  </div>`;
}

function wireRottlerListInteractions() {
  document.querySelectorAll('#rottler-list .job-card').forEach((card) => {
    const row = card.querySelector('.job-card-row');
    const detail = card.querySelector('.job-card-detail');
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return; // Edit/Delete/Redo handle their own clicks
      detail.hidden = !detail.hidden;
    });
  });
}

function wireRottlerRedoButtons() {
  document.querySelectorAll('.rottler-redo-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const original = rottlerState.entries.find((e) => e.id === btn.dataset.redoId);
      if (!original) return;
      openRottlerRedoForm(original);
    });
  });

  document.querySelectorAll('.rottler-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.job-card').dataset.entryId;
      const entry = rottlerState.entries.find((e) => e.id === id);
      if (entry) openRottlerEditModal(entry);
    });
  });

  document.querySelectorAll('.rottler-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.job-card').dataset.entryId;
      if (!confirm('Delete this Rottler entry? You can undo for a few seconds after.')) return;
      let removed, removedIndex;
      try {
        ({ removed, removedIndex } = await api('/.netlify/functions/rottler', { method: 'POST', body: JSON.stringify({ action: 'delete', entryId: id }) }));
      } catch (e) { alert("Couldn't delete: " + e.message); return; }
      rottlerState.entries = rottlerState.entries.filter((e) => e.id !== id);
      paintRottlerList();
      showUndoToast(`Deleted Rottler entry for ${removed.jobNumber || '(no #)'}.`, async () => {
        await api('/.netlify/functions/rottler', { method: 'POST', body: JSON.stringify({ action: 'restore', entry: removed, atIndex: removedIndex }) });
        await renderRottlerTab();
      });
    });
  });
}

function openRottlerEditModal(entry) {
  const form = openModal(`
    <h2>Edit Rottler Entry</h2>
    <div class="detail-grid">
      <label>Job # <input type="text" class="ref-jobnumber" value="${escapeHtml(entry.jobNumber || '')}"></label>
      <label>Customer <input type="text" class="ref-customer" value="${escapeHtml(entry.customer || '')}"></label>
      <label>Engine <input type="text" class="ref-engine" value="${escapeHtml(entry.engine || '')}"></label>
      <label>Piston OD <input type="number" step="0.0001" class="ref-pistonod" value="${entry.pistonOD ?? ''}"></label>
      <label>Bore Size <input type="number" step="0.0001" class="ref-boresize" value="${entry.boreSize ?? ''}"></label>
    </div>
    <div class="rottler-toggle-row" style="margin-top:14px;">
      <label class="urgent-toggle"><input type="checkbox" class="ref-torque-on" ${entry.torquePlate?.on ? 'checked' : ''}> Torque Plate</label>
      <input type="text" class="ref-torque-value rf-inline-input" placeholder="Torque value" value="${escapeHtml(entry.torquePlate?.value || '')}" style="${entry.torquePlate?.on ? '' : 'display:none;'}max-width:160px;">
    </div>
    <div class="rottler-toggle-row">
      <label class="urgent-toggle"><input type="checkbox" class="ref-race-on" ${entry.raceHone?.on ? 'checked' : ''}> Race Hone</label>
    </div>
    <div class="detail-grid ref-race-fields" style="${entry.raceHone?.on ? '' : 'display:none;'}margin-top:6px;">
      <label>RPK <input type="text" class="ref-rpk" value="${escapeHtml(entry.raceHone?.rpk || '')}"></label>
      <label>RK <input type="text" class="ref-rk" value="${escapeHtml(entry.raceHone?.rk || '')}"></label>
      <label>RVK <input type="text" class="ref-rvk" value="${escapeHtml(entry.raceHone?.rvk || '')}"></label>
      <label>Angle <input type="text" class="ref-angle" value="${escapeHtml(entry.raceHone?.angle || '')}"></label>
      <label>Stones used <input type="text" class="ref-stonesused" value="${escapeHtml(entry.raceHone?.stonesUsed || '')}"></label>
    </div>
    <label style="display:block;margin-top:10px;">Notes<textarea class="ref-notes" rows="2" style="width:100%;">${escapeHtml(entry.notes || '')}</textarea></label>
    <div style="margin-top:10px;display:flex;gap:8px;">
      <button id="ref-save" class="btn-primary">Save</button>
      <button id="ref-cancel">Cancel</button>
    </div>
  `);
  form.querySelector('.ref-torque-on').addEventListener('change', (e) => {
    form.querySelector('.ref-torque-value').style.display = e.target.checked ? 'inline-block' : 'none';
  });
  form.querySelector('.ref-race-on').addEventListener('change', (e) => {
    form.querySelector('.ref-race-fields').style.display = e.target.checked ? 'grid' : 'none';
  });
  document.getElementById('ref-cancel').addEventListener('click', () => closeModal());
  document.getElementById('ref-save').addEventListener('click', async () => {
    const patch = {
      jobNumber: form.querySelector('.ref-jobnumber').value,
      customer: form.querySelector('.ref-customer').value,
      engine: form.querySelector('.ref-engine').value,
      pistonOD: form.querySelector('.ref-pistonod').value,
      boreSize: form.querySelector('.ref-boresize').value,
      torquePlate: { on: form.querySelector('.ref-torque-on').checked, value: form.querySelector('.ref-torque-value').value },
      raceHone: form.querySelector('.ref-race-on').checked ? {
        on: true,
        rpk: form.querySelector('.ref-rpk').value,
        rk: form.querySelector('.ref-rk').value,
        rvk: form.querySelector('.ref-rvk').value,
        angle: form.querySelector('.ref-angle').value,
        stonesUsed: form.querySelector('.ref-stonesused').value,
      } : { on: false },
      notes: form.querySelector('.ref-notes').value,
    };
    try {
      const { entry: updated } = await api('/.netlify/functions/rottler', { method: 'POST', body: JSON.stringify({ action: 'update', entryId: entry.id, patch }) });
      const idx = rottlerState.entries.findIndex((e) => e.id === entry.id);
      if (idx >= 0) rottlerState.entries[idx] = updated;
      closeModal();
      paintRottlerList();
    } catch (e) { alert("Couldn't save: " + e.message); }
  });
}

function openRottlerRedoForm(original) {
  // Reuse the input form fields, pre-filled from the original entry, saving
  // as a new linked entry ("redoOfId") rather than editing the original.
  document.getElementById('rf-jobnumber').value = original.jobNumber || '';
  document.getElementById('rf-person').value = original.personResponsible || 'jake';
  document.getElementById('rf-customer').value = original.customer || '';
  document.getElementById('rf-engine').value = original.engine || '';
  document.getElementById('rf-pistonod').value = original.pistonOD ?? '';
  document.getElementById('rf-boresize').value = original.boreSize ?? '';
  document.getElementById('rf-pistonod').dispatchEvent(new Event('input'));
  document.getElementById('rf-notes').value = `Redo of ${formatDate(original.dateAdded)} entry. `;
  rottlerState.pendingRedoOfId = original.id;
  document.getElementById('rf-jobnumber').scrollIntoView({ behavior: 'smooth', block: 'center' });
  const saveBtn = document.getElementById('rf-save');
  saveBtn.textContent = 'Save Redo';
}
