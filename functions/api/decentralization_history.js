/**
 * API endpoint: /api/decentralization_history
 * Returns historical Network Decentralization Scores from KV.
 */
export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600'  // 1 hour cache
  };

  try {
    const KV = context.env?.METRICS_KV;

    if (!KV) {
      return new Response(JSON.stringify({ error: 'KV not bound' }), { status: 500, headers: cors });
    }

    const raw = await KV.get('decentralization_history', { type: 'json' });

    if (!raw) {
      return new Response(JSON.stringify({
        error: 'No decentralization history found',
        _status: 'empty'
      }), { status: 404, headers: cors });
    }

    return new Response(JSON.stringify(raw), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch decentralization history',
      details: e.message
    }), { status: 500, headers: cors });
  }
}
