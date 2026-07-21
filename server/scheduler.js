const { ingestPipeline } = require('./src/ingest/pipeline');

const INTERVAL_MINUTES = parseInt(process.env.INGEST_INTERVAL_MINUTES || '60', 10);

let timer = null;

function startScheduler() {
  if (process.env.ENABLE_SCHEDULER !== 'true') {
    console.info('Scheduler disabled. Set ENABLE_SCHEDULER=true to enable periodic ingestion.');
    return;
  }

  console.info(`Starting ingestion scheduler (every ${INTERVAL_MINUTES} minutes)`);

  async function runOnce() {
    try {
      console.info('Scheduler: running ingestPipeline');
      await ingestPipeline({ enabledSources: ['RSS', 'ReliefWeb', 'ACLED'] });
      console.info('Scheduler: ingest completed');
    } catch (err) {
      console.warn('Scheduler ingest failed', err && err.message ? err.message : err);
    }
  }

  // Run immediately, then schedule
  runOnce();

  timer = setInterval(runOnce, INTERVAL_MINUTES * 60 * 1000);
}

function stopScheduler() {
  if (timer) clearInterval(timer);
}

module.exports = {
  startScheduler,
  stopScheduler,
};
