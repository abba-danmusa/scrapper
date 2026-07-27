/* eslint-disable @typescript-eslint/no-require-imports */
const { ingestPipeline } = require('./src/ingest/pipeline');
const { readSnapshot } = require('./src/ingest/store');

const INTERVAL_MINUTES = parseInt(process.env.INGEST_INTERVAL_MINUTES || '60', 10);

let timer = null;
let hasStarted = false;
let lastRunAt = null;
let lastError = null;
let nextRunAt = null;

function getSchedulerStatus() {
  return {
    enabled: process.env.ENABLE_SCHEDULER === 'true',
    running: Boolean(timer),
    intervalMinutes: INTERVAL_MINUTES,
    lastRunAt,
    nextRunAt,
    lastError,
  };
}

function startScheduler() {
  if (hasStarted) {
    return getSchedulerStatus();
  }

  if (process.env.ENABLE_SCHEDULER !== 'true') {
    console.info('Scheduler disabled. Set ENABLE_SCHEDULER=true to enable periodic ingestion.');
    hasStarted = true;
    return getSchedulerStatus();
  }

  console.info(`Starting ingestion scheduler (every ${INTERVAL_MINUTES} minutes)`);

  async function runOnce() {
    try {
      console.info('Scheduler: running ingestPipeline');
      const result = await ingestPipeline({ enabledSources: ['RSS', 'ReliefWeb', 'HTML', 'ACLED'] });
      const snapshot = readSnapshot();
      lastRunAt = new Date().toISOString();
      nextRunAt = new Date(Date.now() + INTERVAL_MINUTES * 60 * 1000).toISOString();
      lastError = null;
      console.info('Scheduler: ingest completed', {
        count: result.count,
        snapshotCount: snapshot ? snapshot.count : 0,
        generatedAt: snapshot ? snapshot.generatedAt : null
      });
    } catch (err) {
      lastError = err && err.message ? err.message : 'Scheduler ingest failed';
      console.warn('Scheduler ingest failed', lastError);
    }
  }

  hasStarted = true;
  runOnce();
  timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MINUTES * 60 * 1000);

  return getSchedulerStatus();
}

function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
};
