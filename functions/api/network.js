export async function onRequest() {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };

  try {
    const res = await fetch('https://bittensor.api.subscan.io/api/scan/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    const data = await res.json();

    return new Response(JSON.stringify({
      blockHeight: data.data?.blockNum || null,
      validators: data.data?.count_validator || 500,
      subnets: 142,
      emission: '7,200'
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
}