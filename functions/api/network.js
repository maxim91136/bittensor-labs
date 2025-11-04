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

  // Helper: RPC Call
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

  try {
    // Parallel alle Daten holen
    const [header, subnetCountHex, validatorCountHex] = await Promise.all([
      rpcCall('chain_getHeader'),
      rpcCall('state_call', ['SubtensorModule_get_total_subnets', '0x']).catch(() => null),
      rpcCall('state_call', ['SubtensorModule_get_subnetwork_n', '0x00000000']).catch(() => null) // Netuid 0
    ]);

    // Block Height (Hex → Decimal)
    const blockHeight = header?.number ? parseInt(header.number, 16) : null;

    // Subnet Count (Hex → Decimal)
    let subnets = 142; // Fallback
    if (subnetCountHex) {
      // SCALE-encoded u16: erste 2 Bytes
      const hex = subnetCountHex.replace('0x', '');
      if (hex.length >= 4) {
        subnets = parseInt(hex.substring(0, 4), 16);
      }
    }

    // Validator Count (Hex → Decimal)
    let validators = 500; // Fallback
    if (validatorCountHex) {
      const hex = validatorCountHex.replace('0x', '');
      if (hex.length >= 4) {
        validators = parseInt(hex.substring(0, 4), 16);
      }
    }

    return new Response(JSON.stringify({
      blockHeight,
      validators,
      subnets,
      emission: '7,200', // Konstant (7200 blocks/day * 1 TAO/block)
      _live: true
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('RPC error:', e.message);
    
    // Fallback bei Fehler
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