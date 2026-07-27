/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { persistTokenResponse } = require('../src/ingest/sources/acled-oauth');
const { loadTokenState } = require('../src/ingest/sources/acled-token-store');

const tokenPath = path.join(__dirname, '..', 'data', 'acled-token.json');

test('persistTokenResponse writes the latest ACLED token state to disk', () => {
  if (fs.existsSync(tokenPath)) {
    fs.unlinkSync(tokenPath);
  }

  persistTokenResponse({
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    token_type: 'Bearer',
    expires_in: 3600,
  });

  const tokenState = loadTokenState();
  assert.equal(tokenState?.access_token, 'access-token');
  assert.equal(tokenState?.refresh_token, 'refresh-token');
  assert.equal(tokenState?.token_type, 'Bearer');
  assert.ok(tokenState?.expires_at);

  if (fs.existsSync(tokenPath)) {
    fs.unlinkSync(tokenPath);
  }
});
