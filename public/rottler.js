// ===== Rottler — directory: input form + searchable list =====

let rottlerState = { entries: [], canInput: false, linkedMatch: null };

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
    <input type="text" id="rottler-search" class="search-input" placeholder="Search job #, customer, engine…">
    <div id="rottler-list" class="job-list"></div>
  `;
  if (rottlerState.canInput) wireRottlerForm();
  paintRottlerList();
  document.getElementById('rottler-search').addEventListener('input', paintRottlerList);
}

function rottlerInputFormHTML() {
  return `
    <div class="stub-card" style="margin-bottom:20px;">
      <h2>New Job</h2>
      <div class="detail-grid">
        <label>Job # <input type="text" id="rf-jobnumber"></label>
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

      <div class="tv-comp-row" style="margin-top:14px;">
        <label class="urgent-toggle"><input type="checkbox" id="rf-torque-on"> Torque Plate</label>
        <input type="text" id="rf-torque-value" placeholder="Torque value" style="display:none;max-width:160px;" class="rf-inline-input">
      </div>
      <div class="tv-comp-row">
        <label class="urgent-toggle"><input type="checkbox" id="rf-race-on"> Race Hone</label>
      </div>
      <div id="rf-race-fields" class="detail-grid" style="display:none;margin-top:6px;">
        <label>RPK <input type="text" id="rf-rpk"></label>
        <label>RK <input type="text" id="rf-rk"></label>
        <label>RVK <input type="text" id="rf-rvk"></label>
        <label>Angle <input type="text" id="rf-angle"></label>
      </div>

      <label style="display:block;margin-top:10px;">Notes<textarea id="rf-notes" rows="2" style="width:100%;"></textarea></label>
      <button id="rf-save" class="btn-primary" style="margin-top:10px;">Save Job</button>
    </div>
  `;
}

function wireRottlerForm() {
  const jobNumberInput = document.getElementById('rf-jobnumber');
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

  let lookupTimer;
  jobNumberInput.addEventListener('input', () => {
    clearTimeout(lookupTimer);
    rottlerState.linkedMatch = null;
    lookupMsg.hidden = true;
    const q = jobNumberInput.value.trim();
    if (!q) return;
    lookupTimer = setTimeout(async () => {
      try {
        const { match } = await api(`/.netlify/functions/rottler?action=lookup&jobNumber=${encodeURIComponent(q)}`);
        if (match) {
          lookupMsg.hidden = false;
          lookupMsg.innerHTML = `Is this the correct job? <strong>${escapeHtml(match.customer)}</strong> — ${escapeHtml(match.engine)} (${match.sheet}'s sheet)
            <button id="rf-confirm-yes" style="margin-left:8px;">Yes, link it</button>
            <button id="rf-confirm-no">No, it's new</button>`;
          document.getElementById('rf-confirm-yes').addEventListener('click', () => {
            rottlerState.linkedMatch = match;
            lookupMsg.innerHTML = `✓ Linked to ${escapeHtml(match.customer)}'s job.`;
          });
          document.getElementById('rf-confirm-no').addEventListener('click', () => {
            rottlerState.linkedMatch = null;
            lookupMsg.hidden = true;
          });
        }
      } catch { /* silent — lookup is a convenience, not required */ }
    }, 400);
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
  const filtered = rottlerState.entries.filter((e) =>
    !q || [e.jobNumber, e.customer, e.engine].some((f) => (f || '').toLowerCase().includes(q))
  );
  list.innerHTML = filtered.map(rottlerRowHTML).join('') || '<p class="muted-sm">No entries found.</p>';
  wireRottlerRedoButtons();
}

function rottlerRowHTML(e) {
  return `
  <div class="job-card">
    <div class="job-card-row" style="cursor:default;">
      <div class="job-card-main">
        <div class="job-card-title"><strong>${escapeHtml(e.jobNumber || '—')}</strong> ${escapeHtml(e.customer || '')} ${e.redoOf ? '<span class="muted-sm">(redo)</span>' : ''}</div>
        <div class="job-card-sub">${escapeHtml(e.engine || '')} · Piston OD ${e.pistonOD ?? '—'} · Bore ${e.boreSize ?? '—'} · Clearance ${e.clearance ?? '—'}</div>
      </div>
      <div class="job-card-meta">
        <span class="muted-sm">${formatDate(e.dateAdded)}</span>
        <span class="muted-sm">${escapeHtml(e.enteredBy || '')}</span>
        ${rottlerState.canInput ? `<button class="rottler-redo-btn" data-redo-id="${e.id}">↻ Redo</button>` : ''}
      </div>
    </div>
    ${e.notes ? `<div class="job-card-detail"><p class="muted-sm">${escapeHtml(e.notes)}</p></div>` : ''}
  </div>`;
}

function wireRottlerRedoButtons() {
  document.querySelectorAll('.rottler-redo-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const original = rottlerState.entries.find((e) => e.id === btn.dataset.redoId);
      if (!original) return;
      openRottlerRedoForm(original);
    });
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
