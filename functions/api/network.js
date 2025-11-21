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

    // 2) Blockhöhe live auffrischen (optional)
    try {
      const header = await rpcCall('chain_getHeader');
      const live = header?.number ? parseInt(header.number, 16) : null;
      if (live && m && (!m.blockHeight || live > m.blockHeight)) m.blockHeight = live;
      if (!m) m = { blockHeight: live };
    } catch {}

    if (!m) {
      m = { blockHeight: null, validators: 0, subnets: 0, emission: '7,200', totalNeurons: 0, _fallback: true };
    }

    return new Response(JSON.stringify({
      blockHeight: m.blockHeight ?? null,
      validators: m.validators ?? 0,
      subnets: m.subnets ?? 0,
      emission: m.emission ?? '7,200',
      totalNeurons: m.totalNeurons ?? 0,
      halvingThresholds: m.halvingThresholds ?? null,
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