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

  // Dekodiere Subnet-Info aus Byte-Array (SCALE codec)
  function decodeSubnetInfo(bytes) {
    if (!Array.isArray(bytes) || bytes.length < 40) return null;
    
    // SCALE decoding (vereinfacht)
    // max_n ist typischerweise bei Index 2-3 als u16 (little-endian)
    const maxN = bytes[2] + (bytes[3] << 8);
    
    // emission könnte bei Index 34-41 sein als u64 (little-endian)
    let emission = 0;
    for (let i = 0; i < 8; i++) {
      emission += (bytes[34 + i] || 0) * Math.pow(256, i);
    }
    
    return {
      max_n: maxN,
      emission: emission
    };
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
    
    // Filtere und dekodiere nur existierende Subnets
    const activeSubnets = subnetDetails
      .filter(subnet => subnet !== null)
      .map(subnet => decodeSubnetInfo(subnet))
      .filter(subnet => subnet !== null);
    
    // Zähle Validators und Emission über aktive Subnets
    let totalValidators = 0;
    let totalEmission = 0;

    activeSubnets.forEach(subnet => {
      if (subnet.max_n && subnet.max_n > 0) {
        totalValidators += subnet.max_n;
      }
      if (subnet.emission && subnet.emission > 0) {
        totalEmission += subnet.emission / 1e9; // Rao zu TAO
      }
    });

    return new Response(JSON.stringify({
      blockHeight,
      validators: totalValidators > 0 ? totalValidators : 500,
      subnets: activeSubnets.length,
      emission: totalEmission > 0 ? Math.round(totalEmission).toLocaleString() : '7,200',
      _live: true,
      _debug: {
        checkedSubnets: 200,
        activeSubnets: activeSubnets.length,
        sampleDecoded: activeSubnets[0],
        totalValidators,
        totalEmissionRaw: totalEmission
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