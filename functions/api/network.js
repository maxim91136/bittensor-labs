export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: cors });

  const METRICS_URL = context.env.METRICS_URL || 'https://bittensor-labs-python-bites.onrender.com/metrics';
  const RPC_ENDPOINT = 'https://entrypoint-finney.opentensor.ai';

  async function rpcCall(method, params = []) {
    const res = await fetch(RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params })
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }

  try {
    const r = await fetch(METRICS_URL, { 
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000) // 15s für Kaltstart
    });
    
    if (!r.ok) throw new Error(`metrics ${r.status}`);
    const m = await r.json();

    try {
      const header = await rpcCall('chain_getHeader');
      const live = header?.number ? parseInt(header.number, 16) : null;
      if (live && live > (m.blockHeight || 0)) m.blockHeight = live;
    } catch {}

    return new Response(JSON.stringify({
      blockHeight: m.blockHeight ?? null,
      validators: m.validators ?? 0,
      subnets: m.subnets ?? 0,
      emission: '7,200',
      totalNeurons: m.totalNeurons ?? 0,
      _live: true,
      _source: 'bittensor-sdk'
    }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (e) {
    try {
      const header = await rpcCall('chain_getHeader');
      const blockHeight = header?.number ? parseInt(header.number, 16) : null;
      return new Response(JSON.stringify({
        blockHeight, validators: 0, subnets: 0, emission: '7,200', totalNeurons: 0,
        _live: true, _fallback: true, _error: e.message
      }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch {
      return new Response(JSON.stringify({
        blockHeight: null, validators: 0, subnets: 0, emission: '7,200', totalNeurons: 0,
        _fallback: true
      }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }
}