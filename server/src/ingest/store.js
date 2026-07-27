/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'ingested.json');
const HEALTH_FILE = path.join(DATA_DIR, 'health.json');
const WORKSPACE_FILE = path.join(DATA_DIR, 'workspaces.json');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) {
    return;
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

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

loadEnvFile();

const MONGODB_URI = process.env.MONGODB_URI || null;
let mongoClient = null;
let mongoStatus = {
  configured: Boolean(MONGODB_URI),
  connected: false,
  message: MONGODB_URI ? 'MongoDB connection not initialized yet.' : 'MongoDB not configured.',
};

async function ensureMongo() {
  if (!MONGODB_URI) {
    mongoStatus = { configured: false, connected: false, message: 'MongoDB not configured.' };
    return null;
  }
  if (mongoClient) return mongoClient;

  try {
    const { MongoClient } = require('mongodb');
    mongoClient = new MongoClient(MONGODB_URI, { connectTimeoutMS: 10000 });
    await mongoClient.connect();
    mongoStatus = { configured: true, connected: true, message: 'MongoDB connected.' };
    return mongoClient;
  } catch (err) {
    mongoStatus = {
      configured: true,
      connected: false,
      message: err && err.message ? `MongoDB unavailable: ${err.message}` : 'MongoDB unavailable.',
    };
    console.warn('MongoDB connection failed', err && err.message ? err.message : err);
    return null;
  }
}

async function getMongoStatus() {
  if (!MONGODB_URI) {
    return { configured: false, connected: false, message: 'MongoDB not configured.' };
  }

  try {
    await ensureMongo();
  } catch {
    // noop
  }

  return mongoStatus;
}

async function getMongoCollection(collectionName) {
  const client = await ensureMongo();
  if (!client) return null;
  return client.db().collection(collectionName);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

async function persistArticles(articles, metadata = {}) {
  const generatedAt = new Date().toISOString();
  const payload = {
    generatedAt,
    count: articles.length,
    articles,
  };

  const healthPayload = {
    generatedAt,
    lastRunAt: generatedAt,
    sourceHealth: metadata.sourceHealth || [],
    lastErrors: metadata.lastErrors || [],
    runHistory: [
      {
        runAt: generatedAt,
        count: articles.length,
        sourceHealth: metadata.sourceHealth || [],
        lastErrors: metadata.lastErrors || [],
      },
    ],
  };

  if (MONGODB_URI) {
    try {
      const snapshotsCollection = await getMongoCollection('article_snapshots');
      if (snapshotsCollection) {
        await snapshotsCollection.replaceOne(
          { _id: 'latest' },
          { _id: 'latest', ...payload },
          { upsert: true },
        );
      }

      const healthCollection = await getMongoCollection('health');
      if (healthCollection) {
        await healthCollection.replaceOne(
          { _id: 'latest' },
          { _id: 'latest', ...healthPayload },
          { upsert: true },
        );
      }

      const articlesCollection = await getMongoCollection('articles');
      if (articlesCollection && articles.length > 0) {
        const docs = articles.map((article) => ({
          ...article,
          ingestedAt: new Date(),
          snapshot: payload.generatedAt,
        }));

        const operations = docs.map((doc) => ({
          updateOne: {
            filter: { url: doc.url },
            update: { $set: doc },
            upsert: true,
          },
        }));

        await articlesCollection.bulkWrite(operations, { ordered: false });
      }
    } catch (err) {
      console.warn('Mongo persist failed', err && err.message ? err.message : err);
    }

    return;
  }

  ensureDataDir();
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(HEALTH_FILE, JSON.stringify(healthPayload, null, 2), 'utf8');
}

async function readSnapshot() {
  if (MONGODB_URI) {
    try {
      const collection = await getMongoCollection('article_snapshots');
      if (!collection) return null;
      const snapshot = await collection.findOne({ _id: 'latest' });
      if (!snapshot) return null;
      const { _id, ...rest } = snapshot;
      return rest;
    } catch (err) {
      console.warn('Mongo snapshot read failed', err && err.message ? err.message : err);
      return null;
    }
  }

  if (!fs.existsSync(SNAPSHOT_FILE)) return null;
  try {
    const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readHealthState() {
  if (MONGODB_URI) {
    try {
      const collection = await getMongoCollection('health');
      if (!collection) return null;
      const health = await collection.findOne({ _id: 'latest' });
      if (!health) return null;
      const { _id, ...rest } = health;
      return rest;
    } catch (err) {
      console.warn('Mongo health read failed', err && err.message ? err.message : err);
      return null;
    }
  }

  if (!fs.existsSync(HEALTH_FILE)) return null;
  try {
    const raw = fs.readFileSync(HEALTH_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readWorkspaces(status = null) {
  if (MONGODB_URI) {
    try {
      const collection = await getMongoCollection('workspaces');
      if (!collection) return [];

      const query = status ? { status } : {};
      const workspaces = await collection.find(query).sort({ updatedAt: -1 }).toArray();
      return workspaces.map((workspace) => {
        const { _id, ...rest } = workspace;
        return { ...rest, id: rest.id || _id };
      });
    } catch (err) {
      console.warn('Mongo workspace read failed', err && err.message ? err.message : err);
      return [];
    }
  }

  if (!fs.existsSync(WORKSPACE_FILE)) return [];
  try {
    const raw = fs.readFileSync(WORKSPACE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const workspaces = Array.isArray(parsed) ? parsed : [];
    return status ? workspaces.filter((workspace) => (workspace.status || 'draft') === status) : workspaces;
  } catch {
    return [];
  }
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function writeWorkspaces(workspaces) {
  ensureDataDir();
  fs.writeFileSync(WORKSPACE_FILE, JSON.stringify(workspaces, null, 2), 'utf8');
}

async function saveWorkspace(workspace) {
  const nextEntry = {
    id: workspace.id || `workspace-${Date.now()}`,
    ...workspace,
    updatedAt: new Date().toISOString(),
    publishedAt: workspace.status === 'published' ? (workspace.publishedAt || new Date().toISOString()) : null,
  };

  if (MONGODB_URI) {
    try {
      const collection = await getMongoCollection('workspaces');
      if (!collection) return nextEntry;
      await collection.updateOne(
        { _id: nextEntry.id },
        { $set: { _id: nextEntry.id, ...nextEntry } },
        { upsert: true },
      );
      return nextEntry;
    } catch (err) {
      console.warn('Mongo workspace save failed', err && err.message ? err.message : err);
      return nextEntry;
    }
  }

  const workspaces = await readWorkspaces();
  const existingIndex = workspaces.findIndex((entry) => entry.id === nextEntry.id);
  if (existingIndex >= 0) {
    workspaces[existingIndex] = nextEntry;
  } else {
    workspaces.unshift(nextEntry);
  }

  writeWorkspaces(workspaces);
  return nextEntry;
}

async function getWorkspaceById(workspaceId) {
  if (MONGODB_URI) {
    try {
      const collection = await getMongoCollection('workspaces');
      if (!collection) return null;
      const workspace = await collection.findOne({ _id: workspaceId });
      if (!workspace) return null;
      const { _id, ...rest } = workspace;
      return { ...rest, id: rest.id || _id };
    } catch (err) {
      console.warn('Mongo workspace lookup failed', err && err.message ? err.message : err);
      return null;
    }
  }

  const workspaces = await readWorkspaces();
  return workspaces.find((entry) => entry.id === workspaceId) || null;
}

async function getHealthSummary() {
  const snapshot = await readSnapshot();
  const healthState = await readHealthState();
  const workspaces = await readWorkspaces();
  const latestWorkspace = workspaces[0] || null;
  const mongoState = await getMongoStatus();
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
    mongo: mongoState,
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
  getMongoStatus,
};
