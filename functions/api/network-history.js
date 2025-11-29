export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60, s-maxage=120'
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const KV = context.env?.METRICS_KV;
  if (!KV) {
    return new Response(JSON.stringify({ error: 'KV not bound' }), { status: 500, headers: cors });
  }

  try {
    const raw = await KV.get('network_history');
    if (!raw) {
      return new Response(JSON.stringify({ error: 'No Network history found', _source: 'network_history', _status: 'empty' }), {
        status: 404,
        headers: cors
      });
    }
    
    // Parse and validate as JSON array
    let history = [];
    try {
      history = JSON.parse(raw);
      // Ensure it's an array
      if (!Array.isArray(history)) {
        history = [history];
      }
    } catch {
      // If parsing fails, treat as single entry
      history = [JSON.parse(raw)];
    }
    
    return new Response(JSON.stringify(history), { status: 200, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to fetch Network history', details: e.message }), {
      status: 500,
      headers: cors
    });
  }
}
