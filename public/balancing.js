// ===== Balancing — Josh's input form + directory (mirrors Rottler) =====

let balancingState = { entries: [], canInput: false, linkedMatch: null, sortMode: 'date', typeFilter: '' };

const BALANCE_TYPES = ['4cyl', '6cyl', 'V6', 'V8', 'Flywheel', 'Flex Plate', 'Other'];

async function renderBalancingTab() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="stub-card">Loading…</div>`;
  let data;
  try {
    data = await api('/.netlify/functions/balancing?action=list');
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load: ${escapeHtml(e.message)}</div>`;
    return;
  }
  balancingState.entries = data.entries;
  balancingState.canInput = data.canInput;
  paintBalancing();
}

function paintBalancing() {
  const content = document.getElementById('content');
  content.innerHTML = `
    ${balancingState.canInput ? balancingInputFormHTML() : ''}
    <h2 class="section-title">Directory</h2>
    <div class="sheet-toolbar">
      <div class="toolbar-group">
        <button class="chip ${balancingState.sortMode === 'date' ? 'chip-active' : ''}" data-basort="date">Most Recent</button>
        <button class="chip ${balancingState.sortMode === 'jobnumber' ? 'chip-active' : ''}" data-basort="jobnumber">Job #</button>
        <button class="chip ${balancingState.sortMode === 'name' ? 'chip-active' : ''}" data-basort="name">Name</button>
        <button class="chip ${balancingState.sortMode === 'engine' ? 'chip-active' : ''}" data-basort="engine">Engine</button>
      </div>
      <div class="toolbar-group">
        <select id="balancing-type-filter">
          <option value="">All balance types</option>
          ${BALANCE_TYPES.map((t) => `<option value="${t}" ${balancingState.typeFilter === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
    </div>
    <input type="text" id="balancing-search" class="search-input" placeholder="Search job #, customer, engine…">
    <div id="balancing-list" class="job-list"></div>
  `;
  if (balancingState.canInput) wireBalancingForm();
  paintBalancingList();
  document.getElementById('balancing-search').addEventListener('input', paintBalancingList);
  document.querySelectorAll('[data-basort]').forEach((b) => b.addEventListener('click', () => {
    balancingState.sortMode = b.dataset.basort;
    paintBalancing();
  }));
  document.getElementById('balancing-type-filter').addEventListener('change', (e) => {
    balancingState.typeFilter = e.target.value;
    paintBalancingList();
  });
}

function balancingInputFormHTML() {
  return `
    <div class="stub-card" style="margin-bottom:20px;">
      <h2>New Balancing Job</h2>
      <div class="detail-grid">
        <label style="position:relative;">Job # <input type="text" id="baf-jobnumber" autocomplete="off">
          <div id="baf-jobnumber-suggestions" class="autocomplete-dropdown" hidden></div>
        </label>
        <label>Customer Name <input type="text" id="baf-customer"></label>
        <label>Engine <input type="text" id="baf-engine"></label>
        <label>Balance Type
          <select id="baf-balancetype">
            ${BALANCE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </label>
      </div>
      <p id="baf-lookup-msg" class="muted-sm" style="margin-top:8px;" hidden></p>

      <div id="baf-fields" style="margin-top:14px;"></div>

      <label style="display:block;margin-top:10px;">Notes<textarea id="baf-notes" rows="2" style="width:100%;"></textarea></label>
      <button id="baf-save" class="btn-primary" style="margin-top:10px;">Save Job</button>
    </div>
  `;
}

// Renders the conditional field set for the selected Balance Type.
function balancingFieldsHTML(type) {
  const cylBlock = `
    <div class="detail-grid">
      <label class="urgent-toggle"><input type="checkbox" id="baf-pistons"> Pistons balanced</label>
      <label class="urgent-toggle"><input type="checkbox" id="baf-rods"> Rods balanced</label>
      <label class="urgent-toggle"><input type="checkbox" id="baf-flywheelflexplate"> Flywheel/Flex plate balanced</label>
      <label class="urgent-toggle"><input type="checkbox" id="baf-balancer"> Balancer balanced</label>
    </div>
    <div class="rottler-toggle-row" style="margin-top:10px;">
      <label class="urgent-toggle"><input type="checkbox" id="baf-race"> Race balance</label>
      <input type="text" id="baf-racesurcharge" placeholder="Extra hours surcharge" style="display:none;max-width:200px;" class="rf-inline-input">
    </div>
  `;
  const v6v8Extra = `
    <div class="detail-grid" style="margin-top:10px;">
      <label>Internal/External
        <select id="baf-internalexternal"><option value="">—</option><option value="Internal">Internal</option><option value="External">External</option></select>
      </label>
      <label>Bob weight (grams) <input type="number" id="baf-bobweight"></label>
      <label>Balance factor (%) <input type="number" id="baf-balancefactor"></label>
    </div>
    <div class="rottler-toggle-row" style="margin-top:10px;">
      <label class="urgent-toggle"><input type="checkbox" id="baf-heavymetal"> Heavy metal</label>
      <input type="number" id="baf-plugsused" placeholder="Number of plugs used" style="display:none;max-width:200px;" class="rf-inline-input">
    </div>
  `;
  const flywheelBlock = `
    <div class="rottler-toggle-row">
      <label class="urgent-toggle"><input type="checkbox" id="baf-clutch"> Clutch</label>
    </div>
    <div class="detail-grid" style="margin-top:10px;">
      <label>Mirror / Neutral balance
        <select id="baf-mirrorneutral"><option value="">—</option><option value="Mirror balance">Mirror balance</option><option value="Neutral balance">Neutral balance</option></select>
      </label>
      <label>Extra time surcharge (optional) <input type="text" id="baf-timesurcharge"></label>
    </div>
  `;

  if (type === '4cyl' || type === '6cyl') return cylBlock;
  if (type === 'V6' || type === 'V8') return cylBlock + v6v8Extra;
  if (type === 'Flywheel' || type === 'Flex Plate') return flywheelBlock;
  if (type === 'Other') return cylBlock + v6v8Extra + flywheelBlock;
  return '';
}

function wireBalancingFieldToggles() {
  const raceOn = document.getElementById('baf-race');
  const raceSurcharge = document.getElementById('baf-racesurcharge');
  raceOn?.addEventListener('change', () => { raceSurcharge.style.display = raceOn.checked ? 'inline-block' : 'none'; });

  const heavyMetalOn = document.getElementById('baf-heavymetal');
  const plugsUsed = document.getElementById('baf-plugsused');
  heavyMetalOn?.addEventListener('change', () => { plugsUsed.style.display = heavyMetalOn.checked ? 'inline-block' : 'none'; });
}

function wireBalancingForm() {
  const typeSelect = document.getElementById('baf-balancetype');
  const fieldsHolder = document.getElementById('baf-fields');
  const jobNumberInput = document.getElementById('baf-jobnumber');
  const suggestionsBox = document.getElementById('baf-jobnumber-suggestions');
  const lookupMsg = document.getElementById('baf-lookup-msg');

  const renderFields = () => {
    fieldsHolder.innerHTML = balancingFieldsHTML(typeSelect.value);
    wireBalancingFieldToggles();
  };
  typeSelect.addEventListener('change', renderFields);
  renderFields();

  let autocompleteTimer;
  jobNumberInput.addEventListener('input', () => {
    clearTimeout(autocompleteTimer);
    balancingState.linkedMatch = null;
    lookupMsg.hidden = true;
    const q = jobNumberInput.value.trim();
    if (!q) { suggestionsBox.hidden = true; return; }
    autocompleteTimer = setTimeout(async () => {
      try {
        const { suggestions } = await api(`/.netlify/functions/jobsearch?q=${encodeURIComponent(q)}`);
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
            document.getElementById('baf-customer').value = s.customer || '';
            document.getElementById('baf-engine').value = s.engine || '';
            balancingState.linkedMatch = { sheet: s.sheet, jobId: s.jobId, customer: s.customer, engine: s.engine };
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

  document.getElementById('baf-save').addEventListener('click', async () => {
    const val = (id) => document.getElementById(id)?.value;
    const checked = (id) => !!document.getElementById(id)?.checked;
    const payload = {
      action: 'create',
      jobNumber: jobNumberInput.value,
      customer: document.getElementById('baf-customer').value,
      engine: document.getElementById('baf-engine').value,
      balanceType: typeSelect.value,
      pistonsBalanced: checked('baf-pistons'),
      rodsBalanced: checked('baf-rods'),
      flywheelFlexplateBalanced: checked('baf-flywheelflexplate'),
      balancerBalanced: checked('baf-balancer'),
      raceBalance: checked('baf-race'),
      extraHoursSurcharge: val('baf-racesurcharge'),
      internalExternal: val('baf-internalexternal'),
      bobWeight: val('baf-bobweight'),
      balanceFactor: val('baf-balancefactor'),
      heavyMetal: checked('baf-heavymetal'),
      numberOfPlugsUsed: val('baf-plugsused'),
      clutch: checked('baf-clutch'),
      mirrorNeutralBalance: val('baf-mirrorneutral'),
      extraTimeSurcharge: val('baf-timesurcharge'),
      notes: document.getElementById('baf-notes').value,
    };
    if (balancingState.linkedMatch) {
      payload.linkedSheet = balancingState.linkedMatch.sheet;
      payload.linkedJobId = balancingState.linkedMatch.jobId;
    }
    try {
      const { entry } = await api('/.netlify/functions/balancing', { method: 'POST', body: JSON.stringify(payload) });
      balancingState.entries.unshift(entry);
      balancingState.linkedMatch = null;
      paintBalancing();
    } catch (e) { alert("Couldn't save: " + e.message); }
  });
}

function paintBalancingList() {
  const list = document.getElementById('balancing-list');
  const q = (document.getElementById('balancing-search')?.value || '').trim().toLowerCase();
  let filtered = balancingState.entries.filter((e) =>
    !q || [e.jobNumber, e.customer, e.engine].some((f) => (f || '').toLowerCase().includes(q))
  );
  if (balancingState.typeFilter) filtered = filtered.filter((e) => e.balanceType === balancingState.typeFilter);

  if (balancingState.sortMode === 'jobnumber') {
    filtered = [...filtered].sort((a, b) => (a.jobNumber || '').localeCompare(b.jobNumber || '', undefined, { numeric: true }));
  } else if (balancingState.sortMode === 'name') {
    filtered = [...filtered].sort((a, b) => (a.customer || '').localeCompare(b.customer || ''));
  } else if (balancingState.sortMode === 'engine') {
    filtered = [...filtered].sort((a, b) => (a.engine || '').localeCompare(b.engine || ''));
  } else {
    filtered = [...filtered].sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
  }

  list.innerHTML = filtered.map(balancingRowHTML).join('') || '<p class="muted-sm">No entries found.</p>';
  wireBalancingListInteractions();
  wireBalancingRowButtons();
}

function balancingRowHTML(e) {
  const bits = [];
  if (e.pistonsBalanced) bits.push('Pistons balanced');
  if (e.rodsBalanced) bits.push('Rods balanced');
  if (e.flywheelFlexplateBalanced) bits.push('Flywheel/Flex plate balanced');
  if (e.balancerBalanced) bits.push('Balancer balanced');
  if (e.raceBalance) bits.push(`Race balance (surcharge: ${escapeHtml(e.extraHoursSurcharge || '—')})`);
  if (e.internalExternal) bits.push(e.internalExternal);
  if (e.bobWeight) bits.push(`Bob weight ${escapeHtml(e.bobWeight)}g`);
  if (e.balanceFactor) bits.push(`Balance factor ${escapeHtml(e.balanceFactor)}%`);
  if (e.heavyMetal) bits.push(`Heavy metal (${escapeHtml(e.numberOfPlugsUsed || '—')} plugs)`);
  if (e.clutch) bits.push('Clutch');
  if (e.mirrorNeutralBalance) bits.push(e.mirrorNeutralBalance);
  if (e.extraTimeSurcharge) bits.push(`Extra time surcharge: ${escapeHtml(e.extraTimeSurcharge)}`);
  const summaryBits = bits.slice(0, 3).join(', ');
  return `
  <div class="job-card" data-entry-id="${e.id}">
    <div class="job-card-row">
      <div class="job-card-main">
        <div class="job-card-title"><strong>${escapeHtml(e.jobNumber || '—')}</strong> ${escapeHtml(e.customer || '')}</div>
        <div class="job-card-sub">${escapeHtml(e.engine || '')} · ${escapeHtml(e.balanceType || '')}${summaryBits ? ' · ' + summaryBits : ''}${bits.length > 3 ? '…' : ''}</div>
      </div>
      <div class="job-card-meta">
        <span class="muted-sm">${formatDate(e.dateAdded)}</span>
        <span class="muted-sm">${escapeHtml(e.enteredBy || '')}</span>
        ${balancingState.canInput ? `
          <button class="balancing-edit-btn">✎ Edit</button>
          <button class="balancing-delete-btn">🗑 Delete</button>
        ` : ''}
      </div>
    </div>
    <div class="job-card-detail" hidden>
      <div class="detail-grid">
        <div><span class="muted-sm">Job #</span><br>${escapeHtml(e.jobNumber || '—')}</div>
        <div><span class="muted-sm">Customer</span><br>${escapeHtml(e.customer || '—')}</div>
        <div><span class="muted-sm">Engine</span><br>${escapeHtml(e.engine || '—')}</div>
        <div><span class="muted-sm">Balance Type</span><br>${escapeHtml(e.balanceType || '—')}</div>
      </div>
      <h4 style="margin-top:12px;">Details</h4>
      ${bits.length ? `<p class="muted-sm">${bits.map(escapeHtml).join(' · ')}</p>` : '<p class="muted-sm">No balance details recorded.</p>'}
      <div class="detail-grid" style="margin-top:8px;">
        <div><span class="muted-sm">Entered By</span><br>${escapeHtml(e.enteredBy || '—')}</div>
        <div><span class="muted-sm">Date</span><br>${formatDate(e.dateAdded)}</div>
      </div>
      ${e.notes ? `<h4 style="margin-top:12px;">Notes</h4><p class="muted-sm">${escapeHtml(e.notes)}</p>` : ''}
    </div>
  </div>`;
}

function wireBalancingListInteractions() {
  document.querySelectorAll('#balancing-list .job-card').forEach((card) => {
    const row = card.querySelector('.job-card-row');
    const detail = card.querySelector('.job-card-detail');
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      detail.hidden = !detail.hidden;
    });
  });
}

function wireBalancingRowButtons() {
  document.querySelectorAll('.balancing-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.job-card').dataset.entryId;
      const entry = balancingState.entries.find((e) => e.id === id);
      if (entry) openBalancingEditModal(entry);
    });
  });
  document.querySelectorAll('.balancing-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.job-card').dataset.entryId;
      if (!confirm('Delete this Balancing entry? You can undo for a few seconds after.')) return;
      let removed, removedIndex;
      try {
        ({ removed, removedIndex } = await api('/.netlify/functions/balancing', { method: 'POST', body: JSON.stringify({ action: 'delete', entryId: id }) }));
      } catch (e) { alert("Couldn't delete: " + e.message); return; }
      balancingState.entries = balancingState.entries.filter((e) => e.id !== id);
      paintBalancingList();
      showUndoToast(`Deleted Balancing entry for ${removed.jobNumber || '(no #)'}.`, async () => {
        await api('/.netlify/functions/balancing', { method: 'POST', body: JSON.stringify({ action: 'restore', entry: removed, atIndex: removedIndex }) });
        await renderBalancingTab();
      });
    });
  });
}

function openBalancingEditModal(entry) {
  const form = openModal(`
    <h2>Edit Balancing Entry</h2>
    <div class="detail-grid">
      <label>Job # <input type="text" class="bef-jobnumber" value="${escapeHtml(entry.jobNumber || '')}"></label>
      <label>Customer <input type="text" class="bef-customer" value="${escapeHtml(entry.customer || '')}"></label>
      <label>Engine <input type="text" class="bef-engine" value="${escapeHtml(entry.engine || '')}"></label>
      <label>Balance Type
        <select class="bef-balancetype">
          ${BALANCE_TYPES.map((t) => `<option value="${t}" ${t === entry.balanceType ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="bef-fields" style="margin-top:14px;"></div>
    <label style="display:block;margin-top:10px;">Notes<textarea class="bef-notes" rows="2" style="width:100%;">${escapeHtml(entry.notes || '')}</textarea></label>
    <div style="margin-top:10px;display:flex;gap:8px;">
      <button id="bef-save" class="btn-primary">Save</button>
      <button id="bef-cancel">Cancel</button>
    </div>
  `);

  const typeSelect = form.querySelector('.bef-balancetype');
  const fieldsHolder = form.querySelector('.bef-fields');
  const renderFields = () => {
    fieldsHolder.innerHTML = balancingFieldsHTML(typeSelect.value).replace(/id="baf-/g, 'id="bef-f-');
    // Prefill from the existing entry.
    const setChecked = (id, val) => { const el = fieldsHolder.querySelector('#' + id); if (el) el.checked = !!val; };
    const setVal = (id, val) => { const el = fieldsHolder.querySelector('#' + id); if (el) el.value = val || ''; };
    setChecked('bef-f-pistons', entry.pistonsBalanced);
    setChecked('bef-f-rods', entry.rodsBalanced);
    setChecked('bef-f-flywheelflexplate', entry.flywheelFlexplateBalanced);
    setChecked('bef-f-balancer', entry.balancerBalanced);
    setChecked('bef-f-race', entry.raceBalance);
    setVal('bef-f-racesurcharge', entry.extraHoursSurcharge);
    if (fieldsHolder.querySelector('#bef-f-racesurcharge')) fieldsHolder.querySelector('#bef-f-racesurcharge').style.display = entry.raceBalance ? 'inline-block' : 'none';
    setVal('bef-f-internalexternal', entry.internalExternal);
    setVal('bef-f-bobweight', entry.bobWeight);
    setVal('bef-f-balancefactor', entry.balanceFactor);
    setChecked('bef-f-heavymetal', entry.heavyMetal);
    setVal('bef-f-plugsused', entry.numberOfPlugsUsed);
    if (fieldsHolder.querySelector('#bef-f-plugsused')) fieldsHolder.querySelector('#bef-f-plugsused').style.display = entry.heavyMetal ? 'inline-block' : 'none';
    setChecked('bef-f-clutch', entry.clutch);
    setVal('bef-f-mirrorneutral', entry.mirrorNeutralBalance);
    setVal('bef-f-timesurcharge', entry.extraTimeSurcharge);

    const raceOn = fieldsHolder.querySelector('#bef-f-race');
    raceOn?.addEventListener('change', () => { fieldsHolder.querySelector('#bef-f-racesurcharge').style.display = raceOn.checked ? 'inline-block' : 'none'; });
    const heavyMetalOn = fieldsHolder.querySelector('#bef-f-heavymetal');
    heavyMetalOn?.addEventListener('change', () => { fieldsHolder.querySelector('#bef-f-plugsused').style.display = heavyMetalOn.checked ? 'inline-block' : 'none'; });
  };
  typeSelect.addEventListener('change', renderFields);
  renderFields();

  document.getElementById('bef-cancel').addEventListener('click', () => closeModal());
  document.getElementById('bef-save').addEventListener('click', async () => {
    const val = (id) => fieldsHolder.querySelector('#' + id)?.value;
    const checked = (id) => !!fieldsHolder.querySelector('#' + id)?.checked;
    const patch = {
      jobNumber: form.querySelector('.bef-jobnumber').value,
      customer: form.querySelector('.bef-customer').value,
      engine: form.querySelector('.bef-engine').value,
      balanceType: typeSelect.value,
      pistonsBalanced: checked('bef-f-pistons'),
      rodsBalanced: checked('bef-f-rods'),
      flywheelFlexplateBalanced: checked('bef-f-flywheelflexplate'),
      balancerBalanced: checked('bef-f-balancer'),
      raceBalance: checked('bef-f-race'),
      extraHoursSurcharge: val('bef-f-racesurcharge'),
      internalExternal: val('bef-f-internalexternal'),
      bobWeight: val('bef-f-bobweight'),
      balanceFactor: val('bef-f-balancefactor'),
      heavyMetal: checked('bef-f-heavymetal'),
      numberOfPlugsUsed: val('bef-f-plugsused'),
      clutch: checked('bef-f-clutch'),
      mirrorNeutralBalance: val('bef-f-mirrorneutral'),
      extraTimeSurcharge: val('bef-f-timesurcharge'),
      notes: form.querySelector('.bef-notes').value,
    };
    try {
      const { entry: updated } = await api('/.netlify/functions/balancing', { method: 'POST', body: JSON.stringify({ action: 'update', entryId: entry.id, patch }) });
      const idx = balancingState.entries.findIndex((e) => e.id === entry.id);
      if (idx >= 0) balancingState.entries[idx] = updated;
      closeModal();
      paintBalancingList();
    } catch (e) { alert("Couldn't save: " + e.message); }
  });
}
