const { getBlobStore } = require('./_store');
const { pruneOld } = require('./_history');

exports.handler = async () => {
  const store = getBlobStore('jobs');
  const data = await store.get('history', { type: 'json' });
  if (!data) return { statusCode: 200, body: 'Nothing to prune' };

  const before = data.entries.length;
  data.entries = pruneOld(data.entries);
  const after = data.entries.length;

  await store.setJSON('history', data);
  return { statusCode: 200, body: `Pruned ${before - after} history entries older than 60 days` };
};

// Runs once daily at 21:00 UTC. Edit the cron string below to land in your
// local morning — see crontab.guru to convert for your timezone.
exports.config = {
  schedule: '0 21 * * *',
};
