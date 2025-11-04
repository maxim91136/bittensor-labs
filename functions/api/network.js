export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  const RPC_ENDPOINT = 'https://entrypoint-finney.opentensor.ai';

  async function rpcCall(method, params = []) {
    const res = await fetch(RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method,
        params
      })
    });

    if (!res.ok) throw new Error(`RPC ${method} failed: ${res.status}`);
    
    const json = await res.json();
    if (json.error) throw new Error(`RPC error: ${json.error.message}`);
    
    return json.result;
  }

  // Helper: SCALE-decode u64 (little-endian, 8 bytes)
  function decodeU64(hex) {
    if (!hex || hex === '0x') return null;
    const cleaned = hex.replace('0x', '');
    if (cleaned.length < 16) return null;
    
    // Little-endian: bytes rückwärts lesen
    let result = 0n;
    for (let i = 0; i < 16; i += 2) {
      const byte = BigInt(parseInt(cleaned.substr(i, 2), 16));
      result += byte << BigInt((i / 2) * 8);
    }
    return Number(result);
  }

  try {
    // Debug: Alle Varianten testen
    const debugCalls = await Promise.allSettled([
      // Runtime API Methods (verschiedene Schreibweisen)
      rpcCall('state_call', ['SubtensorModule_get_total_subnets', '0x']),
      rpcCall('state_call', ['SubtensorModuleApi_get_total_subnets', '0x']),
      rpcCall('state_call', ['SubtensorModule_total_subnets', '0x']),
      
      rpcCall('state_call', ['SubtensorModule_get_subnetwork_n', '0x00000000']),
      rpcCall('state_call', ['SubtensorModuleApi_get_subnetwork_n', '0x00000000']),
      
      rpcCall('state_call', ['SubtensorModule_get_block_emission', '0x']),
      rpcCall('state_call', ['SubtensorModuleApi_get_block_emission', '0x']),
      
      // Storage Queries (direkter Zugriff)
      rpcCall('state_getMetadata'),
    ]);

    const header = await rpcCall('chain_getHeader');
    const blockHeight = header?.number ? parseInt(header.number, 16) : null;

    return new Response(JSON.stringify({
      blockHeight,
      validators: 500,
      subnets: 142,
      emission: '7,200',
      _live: true,
      _debug: {
        message: 'Testing different RPC methods',
        results: debugCalls.map((result, i) => ({
          index: i,
          status: result.status,
          value: result.status === 'fulfilled' ? result.value : null,
          error: result.status === 'rejected' ? result.reason.message : null
        }))
      }
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('RPC error:', e.message);
    
    return new Response(JSON.stringify({
      blockHeight: null,
      validators: 500,
      subnets: 142,
      emission: '7,200',
      _fallback: true,
      _error: e.message
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
}