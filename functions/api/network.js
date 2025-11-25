export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  const KV = context.env?.METRICS_KV; // KV-Binding: bittensor-labs-metrics
  const RPC_ENDPOINT = 'https://entrypoint-finney.opentensor.ai';

  async function rpcCall(method, params = []) {
    const res = await fetch(RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params })
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message || `RPC ${method} failed`);
    return json.result;
  }

  try {
    // 1) Metriken aus KV (Key: "metrics")
    let m = KV ? await KV.get('metrics', { type: 'json' }) : null;

    // 2) Refresh block height live (optional)
    try {
      const header = await rpcCall('chain_getHeader');
      const live = header?.number ? parseInt(header.number, 16) : null;
      if (live && m && (!m.blockHeight || live > m.blockHeight)) m.blockHeight = live;
      if (!m) m = { blockHeight: live };
    } catch {}

    if (!m) {
      m = { blockHeight: null, validators: 0, subnets: 0, emission: '7,200', totalNeurons: 0, _fallback: true };
    }

    // compute a halvingThresholds fallback if KV doesn't contain it
    function generateHalvingThresholds(maxSupply = 21_000_000, maxEvents = 6) {
      const arr = [];
      for (let n = 1; n <= maxEvents; n++) {
        const threshold = Math.round(maxSupply * (1 - 1 / Math.pow(2, n)));
        arr.push(threshold);
      }
      return arr;
    }

    const halvingThresholds = m?.halvingThresholds ?? generateHalvingThresholds();
    // normalize emission values
    const emission7 = m?.emission_7d ? Number(m.emission_7d) : (m?.emission ? Number(String(m.emission).replace(/,/g, '')) : 7200);
    const emission30 = m?.emission_30d ? Number(m.emission_30d) : emission7;
    const supplyUsed = m?.supplyUsed ?? (m?.circulatingSupply ? 'circulating' : 'total');
    const circulatingSupply = m?.circulatingSupply ?? null;

    return new Response(JSON.stringify({
      blockHeight: m.blockHeight ?? null,
      validators: m.validators ?? 0,
      subnets: m.subnets ?? 0,
      emission: m.emission ?? '7,200',
      emission_daily: m.emission_daily ?? null,
      emission_7d: Number.isFinite(emission7) ? emission7 : 7200,
      emission_30d: Number.isFinite(emission30) ? emission30 : emission7,
      emission_sd_7d: m.emission_sd_7d ?? null,
      emission_samples: m.emission_samples ?? 0,
      last_issuance_ts: m.last_issuance_ts ?? null,
      supplyUsed: supplyUsed,
      circulatingSupply: circulatingSupply,
      totalNeurons: m.totalNeurons ?? 0,
      halvingThresholds: halvingThresholds,
      halving_estimates: m.halving_estimates ?? null,
      avg_emission_for_projection: m.avg_emission_for_projection ?? null,
      projection_method: m.projection_method ?? null,
      projection_confidence: m.projection_confidence ?? null,
      projection_days_used: m.projection_days_used ?? null,
      history_samples: m.history_samples ?? null,
      per_interval_samples: m.per_interval_samples ?? null,
      days_of_history: m.days_of_history ?? null,
      totalIssuance: m.totalIssuance ?? null,
      totalIssuanceHuman: m.totalIssuanceHuman ?? null,
      _source: m._source || 'kv-cache'
    }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({
      blockHeight: null, validators: 0, subnets: 0, emission: '7,200', totalNeurons: 0, _fallback: true
    }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
}