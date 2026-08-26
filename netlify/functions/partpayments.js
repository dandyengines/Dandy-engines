const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');
const { recordHistory, clone } = require('./_history');
const { notifyUser } = require('./_push');

const SHEET_IDS = ['jake', 'mike', 'frank', 'sab', 'lou'];

function canAccess(user) { return user.tabs.includes('partpayments'); }
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

function totals(ppData) {
  let cash = 0, eft = 0;
  for (const job of ppData.jobs) {
    for (const p of job.payments) {
      if (p.type === 'cash') cash += p.amount;
      else if (p.type === 'eft') eft += p.amount;
    }
  }
  return { cashHeld: cash, eftHeld: eft };
}

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session || !canAccess(session.user)) return json(403, { error: 'Forbidden' });
  const { user } = session;

  const store = getBlobStore('jobs'); // shared store, separate key

  if (event.httpMethod === 'GET') {
    const data = await loadPP(store);
    return json(200, { jobs: data.jobs, totals: totals(data) });
  }

  if (event.httpMethod === 'POST') {
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
            engine: '',
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

      return json(200, { job, totals: totals(data), createdNewJobOnSheet });
    }

    if (body.action === 'addInvoice') {
      const before = clone(data);
      const job = data.jobs.find((j) => j.jobNumber.toLowerCase() === (body.jobNumber || '').toLowerCase());
      if (!job) return json(404, { error: 'Job not found in Part Payments' });
      const amount = Number(body.amount);
      if (!amount || amount <= 0) return json(400, { error: 'Amount must be positive' });

      job.invoices.push({
        invoiceNumber: body.invoiceNumber || '',
        creditor: body.creditor || '',
        date: body.date || nowISO().slice(0, 10),
        amount,
      });
      await recordHistory(store, { key: 'partpayments', before, description: `${user.name} added invoice #${body.invoiceNumber || '(no #)'} to job ${job.jobNumber}`, userName: user.name, area: 'partpayments' });
      await savePP(store, data);
      return json(200, { job });
    }

    return json(400, { error: 'Unknown action' });
  }

  return json(405, { error: 'Method not allowed' });
};
