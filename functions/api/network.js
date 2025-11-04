export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  try {
    // Direkt gegen Bittensor Finney RPC
    const res = await fetch('https://entrypoint-finney.opentensor.ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'chain_getHeader',
        params: []
      })
    });

    if (!res.ok) {
      throw new Error(`RPC responded with ${res.status}`);
    }

    const json = await res.json();
    
    // Block Number kommt als Hex (z.B. "0x40a3fb")
    let blockHeight = null;
    if (json.result?.number) {
      blockHeight = parseInt(json.result.number, 16);
    }

    return new Response(JSON.stringify({
      blockHeight,
      validators: 500, // TODO: Braucht komplexere RPC-Query
      subnets: 142,
      emission: '7,200'
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('RPC error:', e.message);
    
    // Fallback
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