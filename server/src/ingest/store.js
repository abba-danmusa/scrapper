const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'ingested.json');

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

function persistArticles(articles) {
  ensureDataDir();

  const payload = {
    generatedAt: new Date().toISOString(),
    count: articles.length,
    articles,
  };

  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(payload, null, 2), 'utf8');

  // Optionally persist to MongoDB
  if (MONGODB_URI) {
    ensureMongo()
      .then((client) => {
        if (!client) return;
        const db = client.db();
        const collection = db.collection('articles');
        // insert documents with a snapshotId so downstream can query
        const docs = articles.map((a) => ({ ...a, ingestedAt: new Date(), snapshot: payload.generatedAt }));
        return collection.insertMany(docs, { ordered: false }).catch((err) => {
          console.warn('Mongo insertMany failed', err && err.message ? err.message : err);
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
  } catch (err) {
    return null;
  }
}

module.exports = {
  persistArticles,
  readSnapshot,
};
