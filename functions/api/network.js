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

    // Teste verschiedene Methoden und zeige die Struktur
    const [subnetsV2, dynamicInfo, allMetagraphs] = await Promise.allSettled([
      rpcCall('subnetInfo_getSubnetsInfo_v2', []),
      rpcCall('subnetInfo_getAllDynamicInfo', []),
      rpcCall('subnetInfo_getAllMetagraphs', [])
    ]);

    return new Response(JSON.stringify({
      blockHeight,
      validators: 500,
      subnets: 128,
      emission: '7,200',
      totalNeurons: 0,
      _live: true,
      _debug: {
        subnetsV2: {
          status: subnetsV2.status,
          isArray: Array.isArray(subnetsV2.value),
          length: subnetsV2.value?.length,
          firstItem: subnetsV2.value?.[0],
          sample: subnetsV2.value?.slice(0, 3)
        },
        dynamicInfo: {
          status: dynamicInfo.status,
          isArray: Array.isArray(dynamicInfo.value),
          length: dynamicInfo.value?.length,
          firstItem: dynamicInfo.value?.[0],
          firstItemKeys: dynamicInfo.value?.[0] ? Object.keys(dynamicInfo.value[0]) : null
        },
        allMetagraphs: {
          status: allMetagraphs.status,
          isArray: Array.isArray(allMetagraphs.value),
          length: allMetagraphs.value?.length,
          firstItem: allMetagraphs.value?.[0],
          firstItemType: typeof allMetagraphs.value?.[0]
        }
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
      subnets: 128,
      emission: '7,200',
      totalNeurons: 0,
      _fallback: true,
      _error: e.message
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
}