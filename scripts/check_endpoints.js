/*
 * Probe /api/network and /api/taostats, print keys + types and basic assertions.
 * Usage:
 *   BASE_URL=https://bittensor-labs.com TAOSTATS_URL=https://taostats.io node scripts/check_endpoints.js
 */

const BASE_URL = process.env.BASE_URL || 'https://bittensor-labs.com';
const NETWORK_ENDPOINT = `${BASE_URL}/api/network`;
const TAOSTATS_URL = process.env.TAOSTATS_URL || 'https://taostats.io';

async function probe(url) {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      console.log(`\n[OK] ${url} returned JSON with keys:`, Object.keys(json));
      return json;
    } catch (e) {
      console.warn(`[WARN] ${url} returned non-JSON / not parseable body, first 200 bytes:`, text.slice(0, 200));
      return null;
    }
  } catch (e) {
    console.error(`[ERR] Request to ${url} failed:`, e.message);
    return null;
  }
}

async function assertNetwork(payload) {
  if (!payload) {
    console.error('[ERR] No payload from /api/network');
    process.exitCode = 1;
    return;
  }
  const REQUIRE_KEYS = ['halvingThresholds', 'totalIssuance', 'circulatingSupply', 'emission_7d', 'emission_30d', 'supplyUsed'];
  const missing = REQUIRE_KEYS.filter(k => !(k in payload));
  if (missing.length) {
    console.warn('[WARN] /api/network missing keys:', missing);
  } else {
    console.log('[OK] /api/network contains expected keys.');
  }
  // Validate types
  const numKeys = ['circulatingSupply', 'totalIssuance', 'emission_7d', 'emission_30d'];
  numKeys.forEach(k => {
    const v = payload[k];
    if (typeof v === 'number' && isFinite(v)) {
      console.log(`[OK] ${k} is numeric: ${v}`);
    } else {
      console.warn(`[WARN] ${k} is not numeric or absent:`, v);
    }
  });
}

async function assertTaostats(payload, url) {
  if (!payload) {
    console.error('[ERR] No payload from taostats endpoint', url);
    process.exitCode = 1;
    return;
  }
  const candidates = ['totalInCirculation', 'issuedThisH', 'blockReward', 'durationBlocks', 'date'];
  const keys = Object.keys(payload);
  console.log('[INFO] taostats keys detected:', keys.slice(0, 50));
  const present = candidates.filter(k => k in payload);
  console.log('[INFO] taostats present candidate keys:', present);
  if (!present.length) {
    console.warn('[WARN] No expected fields in taostats response, you might need to try different endpoint.');
  } else {
    console.log('[OK] Some expected fields are present.');
  }
}

(async () => {
  console.log('Probing network endpoint:', NETWORK_ENDPOINT);
  const net = await probe(NETWORK_ENDPOINT);
  await assertNetwork(net);

  // probes for taostats — try a bunch of candidate endpoints
  const taostatsCandidates = [
    `${TAOSTATS_URL}/api/taostats`,
    `${TAOSTATS_URL}/api/tokenomics`,
    `${TAOSTATS_URL}/api/halving`,
    `${TAOSTATS_URL}/api/v1/tokenomics`,
    `${TAOSTATS_URL}/api/v1/halving`,
    `${TAOSTATS_URL}/api/v1/network`,
    `${TAOSTATS_URL}/api`,
    `${TAOSTATS_URL}/`,
  ];
  for (const url of taostatsCandidates) {
    console.log('\nProbing taostats candidate:', url);
    const taodata = await probe(url);
    if (taodata) {
      await assertTaostats(taodata, url);
      // don't break immediately — we might want to check other endpoints for best match
    }
  }

  console.log('\nDone. If some checks failed, inspect outputs and adjust endpoints f.e. TAOSTATS_URL');
})();
