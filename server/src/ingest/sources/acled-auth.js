/* eslint-disable @typescript-eslint/no-require-imports */
const { requestAccessToken, refreshAccessToken, getValidToken } = require('./acled-oauth');
const { loadTokenState } = require('./acled-token-store');

async function getCurrentTokenState() {
  return loadTokenState();
}

module.exports = {
  requestAccessToken,
  refreshAccessToken,
  getValidToken,
  getCurrentTokenState,
};
