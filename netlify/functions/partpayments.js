const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');
const { recordHistory, clone } = require('./_history');
const { notifyUser } = require('./_push');

const SHEET_IDS = ['jake', 'mike', 'frank', 'sab', 'lou'];
const MACHINING_SHEET_IDS = ['machining', 'machining_lou', 'machining_sab', 'machining_mike'];

function canAccess(user) { return user.perms.partpayments !== 'unseen'; }
function canEditPP(user) { return user.perms.partpayments === 'edit'; }
function nowISO() { return new Date().toISOString(); }

async function loadPP(store) {
  const data = await store.get('partpayments', { type: 'json' });
  return data || { jobs: [] };
}
async function savePP(store, data) { await store.setJSON('partpayments', data); }
async function loadSheet(store, sheet) {
  const data = await store.get(`sheet:${sheet}`, { type: 'json' });
  return data || { jobs: [], order: [] };
}
async function saveSheet(store, sheet, data) { await store.setJSON(`sheet:${sheet}`, data); }

// Part Payments rows should show customer/engine like Builds rows do. Rather
// than trust a stale snapshot, look this up live from Builds + Machining
// every time — so it stays correct even if the customer/engine is edited
// on the source job afterward.
async function enrichWithCustomerEngine(store, jobs) {
  const allSheets = [...SHEET_IDS, ...MACHINING_SHEET_IDS];
  const sheetDatas = {};
  for (const s of allSheets) sheetDatas[s] = await loadSheet(store, s);

  return jobs.map((job) => {
    for (const s of allSheets) {
      const match = sheetDatas[s].jobs.find((j) => (j.jobNumber || '').toLowerCase() === job.jobNumber.toLowerCase());
      if (match) return { ...job, customer: match.customer || '', engine: match.engine || '' };
    }
    return { ...job, customer: job.customer || '', engine: job.engine || '' };
  });
}

function totals(ppData) {
  // Cash Held / EFT Held must reflect the NET position: gross payments
  // received, minus whatever's been invoiced against them. Invoices get
  // their own Cash/EFT/Visa type — Cash deducts from the Cash bucket;
  // both EFT and Visa deduct from the EFT bucket (Visa is tracked
  // separately below purely for reference, same bucket underneath).
  //
  // A job marked Complete is fully settled — its whole balance (whatever's
  // left of its payments minus its invoices) stops counting toward these
  // running totals from that point on, not just archived from the list.
  let cash = 0, eft = 0, visaInvoiced = 0;
  for (const job of ppData.jobs) {
    if (job.completed) continue;
    for (const p of job.payments) {
      if (p.type === 'cash') cash += p.amount;
      else if (p.type === 'eft') eft += p.amount;
    }
    for (const i of job.invoices) {
      const t = i.paymentType || 'eft'; // legacy invoices predating this field default to EFT
      if (t === 'cash') cash -= i.amount;
      else if (t === 'eft') eft -= i.amount;
      else if (t === 'visa') { eft -= i.amount; visaInvoiced += i.amount; }
    }
  }
  return { cashHeld: cash, eftHeld: eft, visaInvoiced };
}

function genId(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session || !canAccess(session.user)) return json(403, { error: 'Forbidden' });
  const { user } = session;

  const store = getBlobStore('jobs'); // shared store, separate key

  if (event.httpMethod === 'GET') {
    const data = await loadPP(store);
    const jobs = await enrichWithCustomerEngine(store, data.jobs);
    return json(200, { jobs, totals: totals(data) });
  }

  if (event.httpMethod === 'POST') {
    if (!canEditPP(user)) return json(403, { error: 'Forbidden' });
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }

    const data = await loadPP(store);

    if (body.action === 'addPayment') {
      const before = clone(data);
      const jobNumber = (body.jobNumber || '').trim();
      if (!jobNumber) return json(400, { error: 'Job # required' });
      if (!['cash', 'eft'].includes(body.paymentType)) return json(400, { error: 'Payment type must be cash or eft' });
      const amount = Number(body.amount);
      if (!amount || amount <= 0) return json(400, { error: 'Amount must be positive' });

      let job = data.jobs.find((j) => j.jobNumber.toLowerCase() === jobNumber.toLowerCase());
      let createdNewJobOnSheet = false;

      if (!job) {
        const personResponsible = body.personResponsible;
        if (!SHEET_IDS.includes(personResponsible)) {
          return json(400, { error: 'A person responsible (Jake/Mike/Lou/Sab/Frank) is required for a new job #' });
        }
        job = {
          jobNumber,
          personResponsible,
          completed: false,
          payments: [],
          invoices: [],
        };
        data.jobs.push(job);

        // Does this job # already exist on that person's sheet? If not, create it there too.
        const sheetData = await loadSheet(store, personResponsible);
        const existing = sheetData.jobs.find((j) => (j.jobNumber || '').toLowerCase() === jobNumber.toLowerCase());
        if (!existing) {
          const newJob = {
            id: 'j_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            jobNumber,
            customer: body.customer || '',
            engine: body.engine || '',
            stage: 'notstarted',
            urgent: false,
            expectedFinish: null,
            dateAdded: nowISO(),
            personResponsible,
            notes: [{ text: 'Part payment documented for this job.', timestamp: nowISO(), author: user.name, auto: true }],
            photos: [],
          };
          sheetData.jobs.push(newJob);
          sheetData.order.push(newJob.id);
          await saveSheet(store, personResponsible, sheetData);
          createdNewJobOnSheet = true;
        } else {
          existing.notes.push({ text: 'Part payment documented for this job.', timestamp: nowISO(), author: user.name, auto: true });
          await saveSheet(store, personResponsible, sheetData);
        }
      }

      job.payments.push({
        id: genId('pmt'),
        type: body.paymentType,
        amount,
        date: body.date || nowISO().slice(0, 10),
        by: user.name,
      });

      await recordHistory(store, { key: 'partpayments', before, description: `${user.name} logged a ${body.paymentType.toUpperCase()} payment of $${amount} on job ${jobNumber}`, userName: user.name, area: 'partpayments' });
      await savePP(store, data);

      if (createdNewJobOnSheet) {
        notifyUser(store, job.personResponsible, 'newJobFromPayments', {
          title: 'Dandy Engines', body: `Mel logged a payment and added job ${jobNumber} to your sheet.`,
        });
      }
      if (session.userId !== 'jake') {
        notifyUser(store, 'jake', 'partPaymentsEntries', {
          title: 'Dandy Engines — Part Payments', body: `${user.name} logged a ${body.paymentType.toUpperCase()} payment of $${amount} on job ${jobNumber}.`,
        });
      }

      return json(200, { job: (await enrichWithCustomerEngine(store, [job]))[0], totals: totals(data), createdNewJobOnSheet });
    }

    if (body.action === 'addInvoice') {
      const before = clone(data);
      const job = data.jobs.find((j) => j.jobNumber.toLowerCase() === (body.jobNumber || '').toLowerCase());
      if (!job) return json(404, { error: 'Job not found in Part Payments' });
      const amount = Number(body.amount);
      if (!amount || amount <= 0) return json(400, { error: 'Amount must be positive' });
      if (!['cash', 'eft', 'visa'].includes(body.paymentType)) return json(400, { error: 'Invoice payment type must be cash, eft, or visa' });

      job.invoices.push({
        id: genId('inv'),
        invoiceNumber: body.invoiceNumber || '',
        creditor: body.creditor || '',
        date: body.date || nowISO().slice(0, 10),
        amount,
        paymentType: body.paymentType,
      });
      await recordHistory(store, { key: 'partpayments', before, description: `${user.name} added invoice #${body.invoiceNumber || '(no #)'} to job ${job.jobNumber}`, userName: user.name, area: 'partpayments' });
      await savePP(store, data);
      return json(200, { job: (await enrichWithCustomerEngine(store, [job]))[0], totals: totals(data) });
    }

    if (body.action === 'updatePayment') {
      const before = clone(data);
      const job = data.jobs.find((j) => j.jobNumber.toLowerCase() === (body.jobNumber || '').toLowerCase());
      if (!job) return json(404, { error: 'Job not found in Part Payments' });
      const payment = job.payments.find((p) => p.id === body.paymentId);
      if (!payment) return json(404, { error: 'Payment not found' });
      const patch = body.patch || {};
      if ('type' in patch) { if (!['cash', 'eft'].includes(patch.type)) return json(400, { error: 'Payment type must be cash or eft' }); payment.type = patch.type; }
      if ('amount' in patch) { const a = Number(patch.amount); if (!a || a <= 0) return json(400, { error: 'Amount must be positive' }); payment.amount = a; }
      if ('date' in patch) payment.date = patch.date;
      await recordHistory(store, { key: 'partpayments', before, description: `${user.name} edited a payment on job ${job.jobNumber}`, userName: user.name, area: 'partpayments' });
      await savePP(store, data);
      return json(200, { job: (await enrichWithCustomerEngine(store, [job]))[0], totals: totals(data) });
    }

    if (body.action === 'deletePayment') {
      const before = clone(data);
      const job = data.jobs.find((j) => j.jobNumber.toLowerCase() === (body.jobNumber || '').toLowerCase());
      if (!job) return json(404, { error: 'Job not found in Part Payments' });
      const idx = job.payments.findIndex((p) => p.id === body.paymentId);
      if (idx === -1) return json(404, { error: 'Payment not found' });
      const [removed] = job.payments.splice(idx, 1);
      await recordHistory(store, { key: 'partpayments', before, description: `${user.name} deleted a payment on job ${job.jobNumber}`, userName: user.name, area: 'partpayments' });
      await savePP(store, data);
      return json(200, { job: (await enrichWithCustomerEngine(store, [job]))[0], totals: totals(data), removed });
    }

    if (body.action === 'updateInvoice') {
      const before = clone(data);
      const job = data.jobs.find((j) => j.jobNumber.toLowerCase() === (body.jobNumber || '').toLowerCase());
      if (!job) return json(404, { error: 'Job not found in Part Payments' });
      const invoice = job.invoices.find((i) => i.id === body.invoiceId);
      if (!invoice) return json(404, { error: 'Invoice not found' });
      const patch = body.patch || {};
      if ('invoiceNumber' in patch) invoice.invoiceNumber = patch.invoiceNumber;
      if ('creditor' in patch) invoice.creditor = patch.creditor;
      if ('date' in patch) invoice.date = patch.date;
      if ('amount' in patch) { const a = Number(patch.amount); if (!a || a <= 0) return json(400, { error: 'Amount must be positive' }); invoice.amount = a; }
      if ('paymentType' in patch) { if (!['cash', 'eft', 'visa'].includes(patch.paymentType)) return json(400, { error: 'Invoice payment type must be cash, eft, or visa' }); invoice.paymentType = patch.paymentType; }
      await recordHistory(store, { key: 'partpayments', before, description: `${user.name} edited invoice #${invoice.invoiceNumber || '(no #)'} on job ${job.jobNumber}`, userName: user.name, area: 'partpayments' });
      await savePP(store, data);
      return json(200, { job: (await enrichWithCustomerEngine(store, [job]))[0], totals: totals(data) });
    }

    if (body.action === 'deleteInvoice') {
      const before = clone(data);
      const job = data.jobs.find((j) => j.jobNumber.toLowerCase() === (body.jobNumber || '').toLowerCase());
      if (!job) return json(404, { error: 'Job not found in Part Payments' });
      const idx = job.invoices.findIndex((i) => i.id === body.invoiceId);
      if (idx === -1) return json(404, { error: 'Invoice not found' });
      const [removed] = job.invoices.splice(idx, 1);
      await recordHistory(store, { key: 'partpayments', before, description: `${user.name} deleted invoice #${removed.invoiceNumber || '(no #)'} on job ${job.jobNumber}`, userName: user.name, area: 'partpayments' });
      await savePP(store, data);
      return json(200, { job: (await enrichWithCustomerEngine(store, [job]))[0], totals: totals(data), removed });
    }

    // ---------- Whole-job actions (job#/person responsible, Complete, Delete) ----------
    if (body.action === 'updateJob') {
      const before = clone(data);
      const job = data.jobs.find((j) => j.jobNumber.toLowerCase() === (body.jobNumber || '').toLowerCase());
      if (!job) return json(404, { error: 'Job not found in Part Payments' });
      const patch = body.patch || {};
      if ('jobNumber' in patch) {
        const newNumber = (patch.jobNumber || '').trim();
        if (!newNumber) return json(400, { error: 'Job # required' });
        const clash = data.jobs.find((j) => j !== job && j.jobNumber.toLowerCase() === newNumber.toLowerCase());
        if (clash) return json(400, { error: 'Another Part Payments entry already uses that job #' });
        job.jobNumber = newNumber;
      }
      if ('personResponsible' in patch) {
        if (!SHEET_IDS.includes(patch.personResponsible)) return json(400, { error: 'Person responsible must be Jake/Mike/Lou/Sab/Frank' });
        job.personResponsible = patch.personResponsible;
      }
      await recordHistory(store, { key: 'partpayments', before, description: `${user.name} edited Part Payments job ${job.jobNumber}`, userName: user.name, area: 'partpayments' });
      await savePP(store, data);
      return json(200, { job: (await enrichWithCustomerEngine(store, [job]))[0], totals: totals(data) });
    }

    if (body.action === 'setJobCompleted') {
      const before = clone(data);
      const job = data.jobs.find((j) => j.jobNumber.toLowerCase() === (body.jobNumber || '').toLowerCase());
      if (!job) return json(404, { error: 'Job not found in Part Payments' });
      job.completed = !!body.completed;
      await recordHistory(store, { key: 'partpayments', before, description: `${user.name} marked Part Payments job ${job.jobNumber} ${job.completed ? 'complete' : 'not complete'}`, userName: user.name, area: 'partpayments' });
      await savePP(store, data);
      return json(200, { job: (await enrichWithCustomerEngine(store, [job]))[0], totals: totals(data) });
    }

    if (body.action === 'deleteJob') {
      const before = clone(data);
      const idx = data.jobs.findIndex((j) => j.jobNumber.toLowerCase() === (body.jobNumber || '').toLowerCase());
      if (idx === -1) return json(404, { error: 'Job not found in Part Payments' });
      const [removed] = data.jobs.splice(idx, 1);
      await recordHistory(store, { key: 'partpayments', before, description: `${user.name} deleted Part Payments job ${removed.jobNumber}`, userName: user.name, area: 'partpayments' });
      await savePP(store, data);
      return json(200, { removed, removedIndex: idx, totals: totals(data) });
    }

    if (body.action === 'restoreJob') {
      const before = clone(data);
      const job = body.job;
      if (!job || !job.jobNumber) return json(400, { error: 'job required' });
      const idx = Math.min(Math.max(body.atIndex ?? data.jobs.length, 0), data.jobs.length);
      data.jobs.splice(idx, 0, job);
      await recordHistory(store, { key: 'partpayments', before, description: `${user.name} restored (undo) Part Payments job ${job.jobNumber}`, userName: user.name, area: 'partpayments' });
      await savePP(store, data);
      return json(200, { job: (await enrichWithCustomerEngine(store, [job]))[0], totals: totals(data) });
    }

    return json(400, { error: 'Unknown action' });
  }

  return json(405, { error: 'Method not allowed' });
};
