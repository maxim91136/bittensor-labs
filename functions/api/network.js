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

  function decodeSubnetIdFromKey(key) {
    // Storage keys für SubnetworkN haben Format: 0x[module_hash][storage_hash][subnet_id]
    // Subnet ID ist am Ende als SCALE-encoded Compact integer
    if (!key || key.length < 70) return null;
    
    const suffix = key.slice(-8); // Letzten 4 Bytes
    try {
      // Parse als little-endian u16
      const bytes = suffix.match(/.{2}/g).map(b => parseInt(b, 16));
      const id = bytes[0] | (bytes[1] << 8);
      return id < 65536 ? id : null;
    } catch {
      return null;
    }
  }

  try {
    const header = await rpcCall('chain_getHeader');
    const blockHeight = header?.number ? parseInt(header.number, 16) : null;

    // Hole alle Storage-Keys für SubnetworkN (Anzahl Neurons pro Subnet)
    // Das zeigt uns ALLE existierenden Subnets
    const moduleHash = '5f27b51b5ec208ee9cb25b55d8728243'; // SubtensorModule
    const storagePrefix = '0x' + moduleHash; // Prefix für alle SubtensorModule Storage Items
    
    const allKeys = await rpcCall('state_getKeys', [storagePrefix]);
    
    // Extrahiere Subnet-IDs aus den Keys
    const subnetIds = new Set();
    
    if (Array.isArray(allKeys)) {
      allKeys.forEach(key => {
        // Suche nach Keys die mit 'SubnetworkN' oder ähnlichen Storage-Items zusammenhängen
        // Die Keys enthalten die Subnet-ID
        if (key && key.length > 66) {
          const id = decodeSubnetIdFromKey(key);
          if (id !== null && id < 1024) {
            subnetIds.add(id);
          }
        }
      });
    }

    const activeSubnetIds = Array.from(subnetIds).sort((a, b) => a - b);
    const totalSubnets = activeSubnetIds.length;

    // Hole Neuron-Daten und Hyperparameter für aktive Subnets
    const [neuronResults, hyperparamResults] = await Promise.all([
      Promise.allSettled(
        activeSubnetIds.map(id => 
          rpcCall('neuronInfo_getNeuronsLite', [id])
            .catch(() => null)
        )
      ),
      Promise.allSettled(
        activeSubnetIds.map(id => 
          rpcCall('subnetInfo_getSubnetHyperparams', [id])
            .catch(() => null)
        )
      )
    ]);

    // Zähle Neurons und Validators
    let totalNeurons = 0;
    let totalValidators = 0;
    
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

    hyperparamResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        const params = result.value;
        if (Array.isArray(params) && params.length > 3) {
          const maxN = params[2] | (params[3] << 8);
          if (maxN > 0 && maxN < 10000) {
            totalValidators += maxN;
          }
        }
      }
    });

    return new Response(JSON.stringify({
      blockHeight,
      validators: totalValidators || 500,
      subnets: totalSubnets,
      emission: '7,200',
      totalNeurons: totalNeurons || 0,
      _live: true,
      _debug: {
        totalStorageKeys: allKeys?.length || 0,
        extractedSubnetIds: activeSubnetIds,
        highestSubnetId: activeSubnetIds.length > 0 ? Math.max(...activeSubnetIds) : 0
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