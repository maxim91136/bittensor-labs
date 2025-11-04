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
    // Hole Header und Subnet-Hyperparameter (die haben max_n = Validator-Anzahl)
    const header = await rpcCall('chain_getHeader');
    
    // Hole Hyperparameter für die ersten 50 Subnets
    const subnetHyperparamsPromises = Array.from({ length: 50 }, (_, i) => 
      rpcCall('subnetInfo_getSubnetHyperparams', [i]).catch(() => null)
    );

    // Hole auch die Neuron-Zahlen für Gesamtanzahl
    const neuronsPromises = Array.from({ length: 50 }, (_, i) => 
      rpcCall('neuronInfo_getNeuronsLite', [i]).catch(() => null)
    );

    const [subnetHyperparams, neurons] = await Promise.all([
      Promise.all(subnetHyperparamsPromises),
      Promise.all(neuronsPromises)
    ]);

    const blockHeight = header?.number ? parseInt(header.number, 16) : null;

    // Filtere aktive Subnets und summiere max_n (Validators)
    const activeSubnets = subnetHyperparams.filter(h => h !== null && h.max_n);
    const totalValidators = activeSubnets.reduce((sum, subnet) => sum + (subnet.max_n || 0), 0);

    // Zähle alle Neurons
    const activeNeuronSubnets = neurons.filter(n => n !== null && n.length > 0);
    const totalNeurons = activeNeuronSubnets.reduce((sum, subnet) => sum + subnet.length, 0);

    return new Response(JSON.stringify({
      blockHeight,
      validators: totalValidators || 500,
      subnets: activeSubnets.length || 32,
      emission: '7,200',
      totalNeurons: totalNeurons || 0,
      _live: true,
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('RPC error:', e.message);
    
    return new Response(JSON.stringify({
      blockHeight: null,
      validators: 500,
      subnets: 32,
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