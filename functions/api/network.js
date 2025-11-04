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

    // Hole detaillierte Subnet-Infos für die ersten 200 IDs
    const subnetDetailsPromises = [];
    for (let i = 0; i < 200; i++) {
      subnetDetailsPromises.push(
        rpcCall('subnetInfo_getSubnetInfo', [i]).catch(() => null)
      );
    }

    const subnetDetails = await Promise.all(subnetDetailsPromises);
    
    // Filtere nur existierende Subnets (nicht null)
    const activeSubnets = subnetDetails.filter(subnet => subnet !== null);
    
    // Zähle Validators über aktive Subnets
    let totalValidators = 0;
    let totalEmission = 0;

    activeSubnets.forEach(subnet => {
      if (subnet?.max_n) {
        totalValidators += parseInt(subnet.max_n);
      }
      if (subnet?.emission) {
        totalEmission += parseInt(subnet.emission) / 1e9;
      }
    });

    return new Response(JSON.stringify({
      blockHeight,
      validators: totalValidators || 500,
      subnets: activeSubnets.length,
      emission: Math.round(totalEmission).toLocaleString(),
      _live: true,
      _debug: {
        message: 'Counting active subnets',
        checkedSubnets: 200,
        activeSubnets: activeSubnets.length,
        sampleSubnet: activeSubnets[0],
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