/**
 * API endpoint: /api/decentralization_exp_history
 * Returns historical Experimental Decentralization Scores (TDS/EDS/Hybrid) from KV.
 *
 * Note: This endpoint is ready but history tracking needs to be implemented in the backend.
 * See: .github/scripts/fetch_decentralization.py for adding TDS/EDS/Hybrid tracking
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

    const raw = await KV.get('decentralization_exp_history', { type: 'json' });

    if (!raw) {
      // Return empty history for now - will be populated when backend tracking is implemented
      return new Response(JSON.stringify({
        entries: [],
        _status: 'not_yet_implemented',
        _note: 'Experimental decentralization history tracking will be added soon'
      }), { status: 200, headers: cors });
    }

    return new Response(JSON.stringify(raw), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch experimental decentralization history',
      details: e.message
    }), { status: 500, headers: cors });
  }
}
