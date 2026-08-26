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
}

function balancingRowHTML(e) {
  const bits = [];
  if (e.pistonsBalanced) bits.push('Pistons');
  if (e.rodsBalanced) bits.push('Rods');
  if (e.flywheelFlexplateBalanced) bits.push('Flywheel/Flex plate');
  if (e.balancerBalanced) bits.push('Balancer');
  if (e.raceBalance) bits.push('Race balance');
  if (e.heavyMetal) bits.push('Heavy metal');
  if (e.clutch) bits.push('Clutch');
  return `
  <div class="job-card">
    <div class="job-card-row" style="cursor:default;">
      <div class="job-card-main">
        <div class="job-card-title"><strong>${escapeHtml(e.jobNumber || '—')}</strong> ${escapeHtml(e.customer || '')}</div>
        <div class="job-card-sub">${escapeHtml(e.engine || '')} · ${escapeHtml(e.balanceType || '')}${bits.length ? ' · ' + bits.join(', ') : ''}</div>
      </div>
      <div class="job-card-meta">
        <span class="muted-sm">${formatDate(e.dateAdded)}</span>
        <span class="muted-sm">${escapeHtml(e.enteredBy || '')}</span>
      </div>
    </div>
    ${e.notes ? `<div class="job-card-detail"><p class="muted-sm">${escapeHtml(e.notes)}</p></div>` : ''}
  </div>`;
}
