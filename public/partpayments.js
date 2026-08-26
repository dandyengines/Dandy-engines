// ===== Part Payments — Jake/Mike/Mel =====

let ppState = { jobs: [], totals: { cashHeld: 0, eftHeld: 0 }, sortBy: 'person' };

async function renderPartPaymentsTab() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="stub-card">Loading…</div>`;
  let data;
  try {
    data = await api('/.netlify/functions/partpayments');
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load: ${escapeHtml(e.message)}</div>`;
    return;
  }
  ppState.jobs = data.jobs;
  ppState.totals = data.totals;
  paintPP();
}

function jobBalance(job) {
  const paid = job.payments.reduce((s, p) => s + p.amount, 0);
  const spent = job.invoices.reduce((s, i) => s + i.amount, 0);
  return { paid, spent, balance: paid - spent };
}

function paintPP() {
  const content = document.getElementById('content');
  let jobs = [...ppState.jobs];
  if (ppState.sortBy === 'person') {
    jobs.sort((a, b) => a.personResponsible.localeCompare(b.personResponsible));
  } else {
    jobs.sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));
  }

  content.innerHTML = `
    <div class="tv-summary" style="grid-template-columns:1fr 1fr;">
      <div><span class="tv-summary-num">$${ppState.totals.cashHeld.toFixed(0)}</span><span class="tv-summary-lbl">Cash Held</span></div>
      <div><span class="tv-summary-num">$${ppState.totals.eftHeld.toFixed(0)}</span><span class="tv-summary-lbl">EFT Held</span></div>
    </div>

    <div class="stub-card" style="margin:16px 0;">
      <h2>Log a Payment</h2>
      <div class="detail-grid">
        <label>Job # <input type="text" id="pp-jobnumber"></label>
        <label>Customer (if new job) <input type="text" id="pp-customer"></label>
        <label>Person Responsible
          <select id="pp-person">
            <option value="jake">Jake</option><option value="mike">Mike</option>
            <option value="lou">Lou</option><option value="sab">Sab</option><option value="frank">Frank</option>
          </select>
        </label>
        <label>Payment Type
          <select id="pp-type"><option value="cash">Cash</option><option value="eft">EFT</option></select>
        </label>
        <label>Amount $ <input type="number" id="pp-amount"></label>
        <label>Date <input type="date" id="pp-date" value="${new Date().toISOString().slice(0, 10)}"></label>
      </div>
      <button id="pp-save" class="btn-primary" style="margin-top:10px;">Log Payment</button>
      <p id="pp-msg" class="muted-sm" style="margin-top:8px;" hidden></p>
    </div>

    <div class="sheet-toolbar">
      <div class="toolbar-group">
        <button class="chip ${ppState.sortBy === 'person' ? 'chip-active' : ''}" data-ppsort="person">Sort: Person Responsible</button>
        <button class="chip ${ppState.sortBy === 'job' ? 'chip-active' : ''}" data-ppsort="job">Sort: Job #</button>
      </div>
    </div>
    <div id="pp-list" class="job-list">${jobs.map(ppRowHTML).join('') || '<p class="muted-sm">No payments logged yet.</p>'}</div>
  `;

  document.querySelectorAll('[data-ppsort]').forEach((btn) =>
    btn.addEventListener('click', () => { ppState.sortBy = btn.dataset.ppsort; paintPP(); })
  );
  wirePPForm();
  wirePPRows();
}

function ppRowHTML(job) {
  const { paid, spent, balance } = jobBalance(job);
  return `
  <div class="job-card" data-pp-job="${escapeHtml(job.jobNumber)}">
    <div class="job-card-row">
      <div class="job-card-main">
        <div class="job-card-title"><strong>${escapeHtml(job.jobNumber)}</strong></div>
        <div class="job-card-sub">Responsible: ${escapeHtml(job.personResponsible)}</div>
      </div>
      <div class="job-card-meta">
        <span>Paid $${paid.toFixed(0)}</span>
        <span>Spent $${spent.toFixed(0)}</span>
        <span style="color:${balance < 0 ? 'var(--de-red)' : 'var(--text)'}"><strong>Balance $${balance.toFixed(0)}</strong></span>
      </div>
    </div>
    <div class="job-card-detail" hidden>
      <h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:8px;">Payments</h4>
      ${job.payments.map((p) => `<div class="note-line">${p.date} — ${p.type.toUpperCase()} $${p.amount.toFixed(0)} (logged by ${escapeHtml(p.by)})</div>`).join('') || '<p class="muted-sm">None</p>'}
      <h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;margin:12px 0 8px;">Spent Against This Job</h4>
      ${job.invoices.map((i) => `<div class="note-line">${i.date} — Invoice #${escapeHtml(i.invoiceNumber)} — ${escapeHtml(i.creditor)} — $${i.amount.toFixed(0)}</div>`).join('') || '<p class="muted-sm">None yet</p>'}
      <div class="detail-grid" style="margin-top:12px;">
        <label>Invoice # <input type="text" class="pp-inv-number"></label>
        <label>Creditor <input type="text" class="pp-inv-creditor"></label>
        <label>Date <input type="date" class="pp-inv-date" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label>Amount $ <input type="number" class="pp-inv-amount"></label>
      </div>
      <button class="pp-inv-save" style="margin-top:8px;padding:8px 14px;border-radius:8px;border:1px solid var(--hairline);background:var(--panel-raised);color:var(--text);">Add Invoice</button>
    </div>
  </div>`;
}

function wirePPForm() {
  document.getElementById('pp-save').addEventListener('click', async () => {
    const msg = document.getElementById('pp-msg');
    msg.hidden = true;
    const payload = {
      action: 'addPayment',
      jobNumber: document.getElementById('pp-jobnumber').value,
      customer: document.getElementById('pp-customer').value,
      personResponsible: document.getElementById('pp-person').value,
      paymentType: document.getElementById('pp-type').value,
      amount: document.getElementById('pp-amount').value,
      date: document.getElementById('pp-date').value,
    };
    try {
      const res = await api('/.netlify/functions/partpayments', { method: 'POST', body: JSON.stringify(payload) });
      ppState.totals = res.totals;
      const idx = ppState.jobs.findIndex((j) => j.jobNumber === res.job.jobNumber);
      if (idx >= 0) ppState.jobs[idx] = res.job; else ppState.jobs.push(res.job);
      if (res.createdNewJobOnSheet) {
        msg.hidden = false;
        msg.textContent = `Logged — a new job was added to ${payload.personResponsible}'s sheet with a note about this payment.`;
      }
      paintPP();
    } catch (e) { alert("Couldn't log payment: " + e.message); }
  });
}

function wirePPRows() {
  document.querySelectorAll('#pp-list .job-card').forEach((card) => {
    const row = card.querySelector('.job-card-row');
    const detail = card.querySelector('.job-card-detail');
    row.addEventListener('click', () => { detail.hidden = !detail.hidden; });

    card.querySelector('.pp-inv-save')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const jobNumber = card.dataset.ppJob;
      const payload = {
        action: 'addInvoice',
        jobNumber,
        invoiceNumber: card.querySelector('.pp-inv-number').value,
        creditor: card.querySelector('.pp-inv-creditor').value,
        date: card.querySelector('.pp-inv-date').value,
        amount: card.querySelector('.pp-inv-amount').value,
      };
      try {
        const { job } = await api('/.netlify/functions/partpayments', { method: 'POST', body: JSON.stringify(payload) });
        const idx = ppState.jobs.findIndex((j) => j.jobNumber === job.jobNumber);
        ppState.jobs[idx] = job;
        paintPP();
      } catch (err) { alert("Couldn't add invoice: " + err.message); }
    });
  });
}
