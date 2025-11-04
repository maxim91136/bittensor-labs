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

  try {
    const header = await rpcCall('chain_getHeader');
    const blockHeight = header?.number ? parseInt(header.number, 16) : null;

    // Metadaten abrufen und analysieren
    const metadata = await rpcCall('state_getMetadata');
    
    // Versuche verschiedene Storage-Abfragen für SubtensorModule
    const storageQueries = await Promise.allSettled([
      // Storage-Abfragen direkt über state_getStorage
      rpcCall('state_getStorage', ['0x' + '5f27b51b5ec208ee9cb25b55d87282435f27b51b5ec208ee9cb25b55d872824301']), // TotalSubnets
      rpcCall('state_getStorage', ['0x' + '5f27b51b5ec208ee9cb25b55d87282435f27b51b5ec208ee9cb25b55d872824302']), // TotalNetworks
    ]);

    return new Response(JSON.stringify({
      blockHeight,
      validators: 500,
      subnets: 142,
      emission: '7,200',
      _live: true,
      _debug: {
        message: 'Metadata received, testing storage queries',
        metadataLength: metadata?.length || 0,
        storageResults: storageQueries.map((result, i) => ({
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