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
    // Hole nur Block Height - das funktioniert zuverlässig
    const header = await rpcCall('chain_getHeader');
    const blockHeight = header?.number ? parseInt(header.number, 16) : null;

    // Für echte Subnet-Daten: Iteriere durch bekannte Subnet-IDs (0-255)
    // und hole einzelne Subnet-Infos
    const subnetChecks = await Promise.allSettled(
      Array.from({ length: 256 }, (_, i) => 
        rpcCall('subnetInfo_getSubnetInfo', [i])
          .then(data => data ? i : null)
          .catch(() => null)
      )
    );

    // Filtere existierende Subnets
    const activeSubnetIds = subnetChecks
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value);

    const totalSubnets = activeSubnetIds.length;

    // Hole Neuron-Counts für aktive Subnets
    const neuronCounts = await Promise.allSettled(
      activeSubnetIds.slice(0, 50).map(id => // Nur erste 50 für Performance
        rpcCall('neuronInfo_getNeuronsLite', [id])
          .then(neurons => neurons?.length || 0)
          .catch(() => 0)
      )
    );

    const totalNeurons = neuronCounts
      .filter(r => r.status === 'fulfilled')
      .reduce((sum, r) => sum + (r.value || 0), 0);

    return new Response(JSON.stringify({
      blockHeight,
      validators: 500, // Placeholder - schwer zu berechnen
      subnets: totalSubnets,
      emission: '7,200', // Placeholder
      totalNeurons: totalNeurons,
      _live: true,
      _debug: {
        activeSubnets: activeSubnetIds.length,
        checkedNeurons: activeSubnetIds.slice(0, 50).length,
        sampleSubnetIds: activeSubnetIds.slice(0, 10)
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