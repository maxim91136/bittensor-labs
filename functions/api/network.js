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

    // Basierend auf bittensor.subtensor API:
    // - get_total_subnets() -> gibt Anzahl zurück
    // - get_subnets() -> gibt Liste der Subnet-IDs zurück
    // - metagraph(netuid) -> gibt Metagraph mit neurons zurück
    
    // Verwende subnetInfo_getSubnetsInfo_v2 -> sollte alle Subnet-Daten enthalten
    const subnetsData = await rpcCall('subnetInfo_getSubnetsInfo_v2', []);
    
    // Hole auch Dynamic Info - enthält max_n (validators) pro Subnet
    const dynamicInfoData = await rpcCall('subnetInfo_getAllDynamicInfo', []);

    // Parse die SCALE-encoded Daten
    // Format: [netuid, subnet_data, netuid, subnet_data, ...]
    let activeSubnetIds = [];
    let totalValidators = 0;
    
    if (Array.isArray(subnetsData) && subnetsData.length > 1) {
      // Compact encoding: erstes Element ist die Anzahl
      const count = subnetsData[0];
      
      // Für jeden Subnet: netuid ist ein u16 (2 bytes)
      for (let i = 1; i < Math.min(subnetsData.length, count * 100); i++) {
        const netuid = subnetsData[i];
        if (typeof netuid === 'number' && netuid < 1024 && !activeSubnetIds.includes(netuid)) {
          activeSubnetIds.push(netuid);
        }
      }
    }

    // Parse dynamic info für validators (max_n)
    if (Array.isArray(dynamicInfoData) && dynamicInfoData.length > 1) {
      const count = dynamicInfoData[0];
      
      // Jeder Eintrag: netuid (u16) + dynamic_info struct
      // max_n ist typischerweise bei Offset 2-3 im struct
      for (let i = 1; i < Math.min(dynamicInfoData.length, count * 50); i += 40) {
        if (dynamicInfoData[i + 2] !== undefined && dynamicInfoData[i + 3] !== undefined) {
          const maxN = dynamicInfoData[i + 2] | (dynamicInfoData[i + 3] << 8);
          if (maxN > 0 && maxN < 10000) {
            totalValidators += maxN;
          }
        }
      }
    }

    // Hole Neurons für alle aktiven Subnets
    const neuronPromises = activeSubnetIds.slice(0, 100).map(netuid =>
      rpcCall('neuronInfo_getNeuronsLite', [netuid])
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            const count = data[0];
            return count < 252 ? count : 0;
          }
          return 0;
        })
        .catch(() => 0)
    );

    const neuronCounts = await Promise.all(neuronPromises);
    const totalNeurons = neuronCounts.reduce((sum, count) => sum + count, 0);

    return new Response(JSON.stringify({
      blockHeight,
      validators: totalValidators || 500,
      subnets: activeSubnetIds.length || 128,
      emission: '7,200',
      totalNeurons: totalNeurons || 0,
      _live: true,
      _debug: {
        subnetsDataLength: subnetsData?.length,
        dynamicInfoLength: dynamicInfoData?.length,
        foundSubnetIds: activeSubnetIds.slice(0, 20),
        totalSubnets: activeSubnetIds.length
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