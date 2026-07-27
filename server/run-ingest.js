/* eslint-disable @typescript-eslint/no-require-imports */
const { ingestPipeline } = require('./src/ingest/pipeline');

(async () => {
  try {
    const result = await ingestPipeline({ enabledSources: ['RSS', 'ReliefWeb', 'HTML', 'ACLED'] });
    console.log('Ingest finished', { ok: true, count: result.count });
    process.exit(0);
  } catch (err) {
    console.error('Ingest failed', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
