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

    // Prüfe bis 4096 (2^12) - großzügiger Bereich
    const MAX_SUBNET_ID = 4096;
    
    // Batch die Requests in Gruppen von 100 für bessere Performance
    const batchSize = 100;
    const batches = Math.ceil(MAX_SUBNET_ID / batchSize);
    
    let activeSubnetIds = [];
    
    for (let b = 0; b < batches; b++) {
      const start = b * batchSize;
      const end = Math.min(start + batchSize, MAX_SUBNET_ID);
      
      const batchChecks = await Promise.allSettled(
        Array.from({ length: end - start }, (_, i) => {
          const id = start + i;
          return rpcCall('subnetInfo_getSubnetInfo', [id])
            .then(data => data ? id : null)
            .catch(() => null);
        })
      );
      
      const batchResults = batchChecks
        .filter(r => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);
      
      activeSubnetIds.push(...batchResults);
      
      // Früher Abbruch wenn 100+ IDs ohne Treffer
      if (batchResults.length === 0 && activeSubnetIds.length > 0 && b > 2) {
        break;
      }
    }

    const totalSubnets = activeSubnetIds.length;

    // Hole Neuron-Daten für ALLE aktiven Subnets
    const neuronResults = await Promise.allSettled(
      activeSubnetIds.map(id => 
        rpcCall('neuronInfo_getNeuronsLite', [id])
          .catch(() => null)
      )
    );

    // Zähle Neurons - SCALE-encoded
    let totalNeurons = 0;
    
    neuronResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        const data = result.value;
        if (Array.isArray(data) && data.length > 0) {
          const firstByte = data[0];
          if (firstByte < 252) {
            totalNeurons += firstByte;
          }
        }
      }
    });

    return new Response(JSON.stringify({
      blockHeight,
      validators: 500, // Placeholder
      subnets: totalSubnets,
      emission: '7,200',
      totalNeurons: totalNeurons || 0,
      _live: true,
      _debug: {
        checkedRange: `0-${MAX_SUBNET_ID}`,
        activeSubnets: activeSubnetIds.length,
        highestSubnetId: activeSubnetIds.length > 0 ? Math.max(...activeSubnetIds) : 0,
        allSubnetIds: activeSubnetIds.sort((a, b) => a - b)
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