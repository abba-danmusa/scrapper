const express = require('express');
const { ingestPipeline } = require('./src/ingest/pipeline');
const { requestAccessToken, refreshAccessToken, getCurrentTokenState } = require('./src/ingest/sources/acled-auth');

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

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'scraper-server' });
});

app.post('/acled/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'username and password are required' });
    }

    const response = await requestAccessToken(username, password);
    res.json({ ok: true, token: response });
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

app.listen(PORT, () => {
  console.log(`Scraper server listening on http://localhost:${PORT}`);
});

// Start optional scheduler
try {
  const { startScheduler } = require('./scheduler');
  startScheduler();
} catch (err) {
  console.warn('Scheduler module failed to start', err && err.message ? err.message : err);
}
