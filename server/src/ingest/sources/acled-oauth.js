/* eslint-disable @typescript-eslint/no-require-imports */
const https = require('https');
const querystring = require('querystring');
const { loadTokenState, saveTokenState } = require('./acled-token-store');

const TOKEN_URL = 'https://acleddata.com/oauth/token';
const RESOURCE_URL = 'https://acleddata.com/api/acled/read';

function httpPost(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const payload = typeof data === 'string' ? data : querystring.stringify(data);
    const options = {
      method: 'POST',
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(responseData));
          } catch (err) {
            reject(new Error(`Invalid JSON response from ${url}: ${err.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      method: 'GET',
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers,
    };

    https
      .get(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => (responseData += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(responseData));
            } catch (err) {
              reject(new Error(`Invalid JSON response from ${url}: ${err.message}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        });
      })
      .on('error', reject);
  });
}

async function requestAccessToken(username, password) {
  const payload = {
    username,
    password,
    grant_type: 'password',
    client_id: 'acled',
    scope: 'authenticated',
  };

  return httpPost(TOKEN_URL, payload);
}

async function refreshAccessToken(refreshToken) {
  const payload = {
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    client_id: 'acled',
  };

  return httpPost(TOKEN_URL, payload);
}

function tokenIsValid(tokenState) {
  if (!tokenState || !tokenState.access_token || !tokenState.expires_at) return false;
  return Date.now() < tokenState.expires_at - 30 * 1000;
}

async function getValidToken() {
  const tokenState = loadTokenState();

  if (tokenIsValid(tokenState)) {
    return tokenState.access_token;
  }

  if (tokenState && tokenState.refresh_token) {
    try {
      const refreshed = await refreshAccessToken(tokenState.refresh_token);
      return storeTokenState(refreshed);
    } catch (err) {
      console.warn('ACLED refresh failed, falling back to password grant', err.message || err);
    }
  }

  const username = process.env.ACLED_USERNAME;
  const password = process.env.ACLED_PASSWORD;
  if (!username || !password) {
    throw new Error('ACLED_USERNAME or ACLED_PASSWORD is missing');
  }

  const tokenResponse = await requestAccessToken(username, password);
  return storeTokenState(tokenResponse);
}

function persistTokenResponse(response) {
  const expiresAt = Date.now() + (response.expires_in || 86400) * 1000;
  const tokenState = {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    token_type: response.token_type,
    expires_in: response.expires_in,
    expires_at: expiresAt,
  };
  saveTokenState(tokenState);
  return tokenState;
}

function storeTokenState(response) {
  return persistTokenResponse(response).access_token;
}

async function fetchAcledResource(params) {
  const accessToken = await getValidToken();
  const url = `${RESOURCE_URL}?${querystring.stringify(params)}`;
  return httpGet(url, {
    Authorization: `Bearer ${accessToken}`,
  });
}

module.exports = {
  requestAccessToken,
  refreshAccessToken,
  fetchAcledResource,
  getValidToken,
  persistTokenResponse,
};
