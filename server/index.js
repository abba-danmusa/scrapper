/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const express = require('express');

function loadEnvFile() {
  const candidatePaths = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env'),
  ];

  for (const envPath of candidatePaths) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      if (!key || process.env[key]) {
        continue;
      }

      const value = rawValue.replace(/^['"]|['"]$/g, '');
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const { ingestPipeline } = require('./src/ingest/pipeline');
const { requestAccessToken, refreshAccessToken, getCurrentTokenState } = require('./src/ingest/sources/acled-auth');
const { persistTokenResponse } = require('./src/ingest/sources/acled-oauth');
const { readWorkspaces, saveWorkspace, getWorkspaceById } = require('./src/ingest/store');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

app.get('/health', async (_req, res) => {
  const { getHealthSummary } = require('./src/ingest/store');
  const { getSchedulerStatus } = require('./scheduler');
  const summary = await getHealthSummary();
  res.json({
    ok: true,
    service: 'scraper-server',
    ...summary,
    scheduler: getSchedulerStatus()
  });
});

app.post('/acled/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'username and password are required' });
    }

    const response = await requestAccessToken(username, password);
    const persisted = persistTokenResponse(response);
    res.json({ ok: true, token: persisted });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Login failed' });
  }
});

app.post('/acled/refresh', async (_req, res) => {
  try {
    const current = await getCurrentTokenState();
    if (!current || !current.refresh_token) {
      return res.status(400).json({ ok: false, error: 'No refresh token stored' });
    }

    const response = await refreshAccessToken(current.refresh_token);
    res.json({ ok: true, token: response });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Refresh failed' });
  }
});

app.get('/acled/token', async (_req, res) => {
  try {
    const current = await getCurrentTokenState();
    if (!current) {
      return res.status(404).json({ ok: false, error: 'No token stored' });
    }
    res.json({ ok: true, token: current });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to read token state' });
  }
});

app.post('/ingest', async (req, res) => {
  try {
    const result = await ingestPipeline(req.body);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown ingestion error'
    });
  }
});

app.get('/workspaces', async (req, res) => {
  const requestedStatus = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : null;
  const workspaces = await readWorkspaces(requestedStatus);
  res.json({ ok: true, workspaces });
});

app.get('/workspaces/:workspaceId', async (req, res) => {
  const workspace = await getWorkspaceById(req.params.workspaceId);
  if (!workspace) {
    return res.status(404).json({ ok: false, error: 'Workspace not found' });
  }

  return res.json({ ok: true, workspace });
});

app.post('/workspaces', async (req, res) => {
  try {
    const saved = await saveWorkspace(req.body || {});
    res.json({ ok: true, workspace: saved });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to save workspace' });
  }
});

app.listen(PORT, async () => {
  const { getMongoStatus } = require('./src/ingest/store');
  const mongoState = await getMongoStatus();
  console.log(`Scraper server listening on http://localhost:${PORT}`);
  console.log(`MongoDB status: ${mongoState.message}`);
});

// Start optional scheduler
try {
  const { startScheduler } = require('./scheduler');
  startScheduler();
} catch (err) {
  console.warn('Scheduler module failed to start', err && err.message ? err.message : err);
}
