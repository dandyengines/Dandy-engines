const { getBlobStore } = require('./_store');
const { getSession, json } = require('./_shared');

// Keep in sync with the same mapping in jobs.js.
const MACHINING_OWNERS = { machining: 'jake', machining_lou: 'lou', machining_sab: 'sab', machining_mike: 'mike' };
function isMachiningSheet(sheet) { return sheet in MACHINING_OWNERS; }
function tabIdForSheet(sheet) { return isMachiningSheet(sheet) ? sheet : `builds_${sheet}`; }

// Access control now flows through the live permission matrix (user.perms,
// attached by getSession) — see _permissions.js.
function canEditSheet(user, sheet) { return user.perms[tabIdForSheet(sheet)] === 'edit'; }
function canViewSheet(user, sheet) { return user.perms[tabIdForSheet(sheet)] !== 'unseen'; }

exports.handler = async (event) => {
  const session = await getSession(event);
  if (!session) return json(401, { error: 'Not logged in' });
  const { user } = session;

  const jobsStore = getBlobStore('jobs');
  const photosStore = getBlobStore('photos');
  const params = event.queryStringParameters || {};

  if (event.httpMethod === 'GET') {
    // Serve one photo's raw bytes, but only if the requester can view the
    // sheet it's attached to (checked via the sheet param they must pass).
    const sheet = params.sheet;
    if (!sheet || !canViewSheet(user, sheet)) return json(403, { error: 'Forbidden' });

    const record = await photosStore.get(params.id, { type: 'json' });
    if (!record) return json(404, { error: 'Not found' });

    return {
      statusCode: 200,
      headers: { 'Content-Type': record.contentType },
      body: record.base64,
      isBase64Encoded: true,
    };
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }
    const { sheet, jobId, dataUrl } = body;
    if (!canEditSheet(user, sheet)) return json(403, { error: 'Forbidden' });

    const match = /^data:(.+);base64,(.+)$/.exec(dataUrl || '');
    if (!match) return json(400, { error: 'Bad image data' });
    const [, contentType, base64] = match;

    // 5MB-ish sanity cap (base64 is ~1.37x raw size)
    if (base64.length > 7_000_000) return json(400, { error: 'Image too large' });

    const photoId = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await photosStore.setJSON(photoId, { contentType, base64, uploadedBy: user.name, uploadedAt: new Date().toISOString() });

    const sheetData = await jobsStore.get(`sheet:${sheet}`, { type: 'json' });
    if (sheetData) {
      const job = sheetData.jobs.find((j) => j.id === jobId);
      if (job) {
        job.photos = job.photos || [];
        job.photos.push(photoId);
        await jobsStore.setJSON(`sheet:${sheet}`, sheetData);
      }
    }

    return json(200, { photoId });
  }

  return json(405, { error: 'Method not allowed' });
};
