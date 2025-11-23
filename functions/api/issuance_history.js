export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=30, s-maxage=60'
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const KV = context.env?.METRICS_KV;
  if (!KV) {
    return new Response(JSON.stringify({ error: 'KV not bound' }), { status: 500, headers: cors });
  }

  try {
    const raw = await KV.get('issuance_history');
    if (!raw) {
      return new Response(JSON.stringify({ error: 'No issuance history found', _status: 'empty' }), { status: 404, headers: cors });
    }
    // raw is expected to be a JSON string
    return new Response(raw, { status: 200, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to fetch issuance history', details: e.message }), { status: 500, headers: cors });
  }
}
