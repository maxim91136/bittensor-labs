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
    const raw = await KV.get('tao_ath_atl');
    if (!raw) {
      return new Response(JSON.stringify({ error: 'no_data' }), { status: 404, headers: cors });
    }
    const obj = JSON.parse(raw);
    const out = {
      updated: obj.updated || null,
      source: obj.source || null,
      _source: 'kv'
    };
    return new Response(JSON.stringify(out), { status: 200, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'failed', details: e.message }), { status: 500, headers: cors });
  }
}
