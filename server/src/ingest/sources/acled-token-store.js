/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const TOKEN_PATH = path.join(DATA_DIR, 'acled-token.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadTokenState() {
  try {
    if (!fs.existsSync(TOKEN_PATH)) return null;
    const raw = fs.readFileSync(TOKEN_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveTokenState(state) {
  ensureDataDir();
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function clearTokenState() {
  try {
    if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
  } catch {
    // ignore
  }
}

module.exports = {
  loadTokenState,
  saveTokenState,
  clearTokenState,
};
