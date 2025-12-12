/**
 * API endpoint for halving history data
 * Returns array of past halving events with timestamps
 */

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
    const raw = await KV.get('halving_history');
    if (!raw) {
      // No halvings yet - return empty array
      return new Response(JSON.stringify({
        halvings: [],
        last_halving: null,
        _status: 'no_halvings_yet'
      }), {
        status: 200,
        headers: cors
      });
    }

    const data = JSON.parse(raw);
    // Ensure we return a consistent format
    const halvings = Array.isArray(data) ? data : (data.halvings || []);
    const lastHalving = halvings.length > 0 ? halvings[halvings.length - 1] : null;

    return new Response(JSON.stringify({
      halvings,
      last_halving: lastHalving,
      _status: 'ok'
    }), { status: 200, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch halving data',
      details: e.message
    }), {
      status: 500,
      headers: cors
    });
  }
}
