/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'ingested.json');
const HEALTH_FILE = path.join(DATA_DIR, 'health.json');
const WORKSPACE_FILE = path.join(DATA_DIR, 'workspaces.json');

const MONGODB_URI = process.env.MONGODB_URI || null;
let mongoClient = null;

async function ensureMongo() {
  if (!MONGODB_URI) return null;
  if (mongoClient) return mongoClient;

  const { MongoClient } = require('mongodb');
  mongoClient = new MongoClient(MONGODB_URI, { connectTimeoutMS: 10000 });
  await mongoClient.connect();
  return mongoClient;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function persistArticles(articles, metadata = {}) {
  ensureDataDir();

  const payload = {
    generatedAt: new Date().toISOString(),
    count: articles.length,
    articles,
  };

  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(payload, null, 2), 'utf8');

  const healthState = readHealthState() || {};
  const nextRunHistory = [
    {
      runAt: new Date().toISOString(),
      count: articles.length,
      sourceHealth: metadata.sourceHealth || [],
      lastErrors: metadata.lastErrors || [],
    },
    ...(healthState.runHistory || []).slice(0, 9),
  ];

  const healthPayload = {
    generatedAt: new Date().toISOString(),
    lastRunAt: new Date().toISOString(),
    sourceHealth: metadata.sourceHealth || [],
    lastErrors: metadata.lastErrors || [],
    runHistory: nextRunHistory,
  };

  fs.writeFileSync(HEALTH_FILE, JSON.stringify(healthPayload, null, 2), 'utf8');

  // Optionally persist to MongoDB
  if (MONGODB_URI) {
    ensureMongo()
      .then((client) => {
        if (!client) return;
        const db = client.db();
        const collection = db.collection('articles');

        if (articles.length === 0) return null;

        const docs = articles.map((a) => ({ ...a, ingestedAt: new Date(), snapshot: payload.generatedAt }));
        const operations = docs.map((doc) => ({
          updateOne: {
            filter: { url: doc.url },
            update: { $set: doc },
            upsert: true
          }
        }));

        return collection.bulkWrite(operations, { ordered: false }).catch((err) => {
          console.warn('Mongo bulkWrite failed', err && err.message ? err.message : err);
        });
      })
      .catch((err) => console.warn('Mongo persist failed', err && err.message ? err.message : err));
  }
}

function readSnapshot() {
  if (!fs.existsSync(SNAPSHOT_FILE)) return null;
  try {
    const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readHealthState() {
  if (!fs.existsSync(HEALTH_FILE)) return null;
  try {
    const raw = fs.readFileSync(HEALTH_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readWorkspaces() {
  if (!fs.existsSync(WORKSPACE_FILE)) return [];
  try {
    const raw = fs.readFileSync(WORKSPACE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWorkspaces(workspaces) {
  ensureDataDir();
  fs.writeFileSync(WORKSPACE_FILE, JSON.stringify(workspaces, null, 2), 'utf8');
}

function saveWorkspace(workspace) {
  const workspaces = readWorkspaces();
  const nextEntry = {
    id: workspace.id || `workspace-${Date.now()}`,
    ...workspace,
    updatedAt: new Date().toISOString(),
    publishedAt: workspace.status === 'published' ? (workspace.publishedAt || new Date().toISOString()) : null,
  };

  const existingIndex = workspaces.findIndex((entry) => entry.id === nextEntry.id);
  if (existingIndex >= 0) {
    workspaces[existingIndex] = nextEntry;
  } else {
    workspaces.unshift(nextEntry);
  }

  writeWorkspaces(workspaces);
  return nextEntry;
}

function getWorkspaceById(workspaceId) {
  return readWorkspaces().find((entry) => entry.id === workspaceId) || null;
}

function getHealthSummary() {
  const snapshot = readSnapshot();
  const healthState = readHealthState();
  const workspaces = readWorkspaces();
  const latestWorkspace = workspaces[0] || null;
  return {
    ok: true,
    snapshotFile: SNAPSHOT_FILE,
    healthFile: HEALTH_FILE,
    workspaceFile: WORKSPACE_FILE,
    snapshotCount: snapshot ? snapshot.count : 0,
    generatedAt: snapshot ? snapshot.generatedAt : null,
    hasSnapshot: Boolean(snapshot),
    sourceHealth: healthState ? healthState.sourceHealth || [] : [],
    lastErrors: healthState ? healthState.lastErrors || [] : [],
    lastRunAt: healthState ? healthState.lastRunAt : null,
    runHistory: healthState ? healthState.runHistory || [] : [],
    workspaceCount: workspaces.length,
    latestWorkspaceTitle: latestWorkspace ? latestWorkspace.title || latestWorkspace.id || 'Untitled workspace' : null,
    latestWorkspaceStatus: latestWorkspace ? latestWorkspace.status || 'draft' : null,
    latestWorkspaceUpdatedAt: latestWorkspace ? latestWorkspace.updatedAt || null : null,
  };
}

module.exports = {
  persistArticles,
  readSnapshot,
  readHealthState,
  getHealthSummary,
  readWorkspaces,
  saveWorkspace,
  getWorkspaceById,
};
