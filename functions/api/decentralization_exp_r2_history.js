/**
 * API endpoint: /api/decentralization_exp_r2_history
 * Returns historical Experimental Decentralization Scores (TDS/EDS/Hybrid) from R2.
 *
 * Note: This endpoint is ready but history tracking needs to be implemented in the backend.
 * See: .github/scripts/fetch_decentralization.py for adding TDS/EDS/Hybrid tracking
 */
export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600'
  };

  try {
    const url = new URL(context.request.url);
    const days = parseInt(url.searchParams.get('days') || '30', 10);

    // For now, return empty history - will be populated when backend tracking is implemented
    return new Response(JSON.stringify({
      entries: [],
      days_requested: days,
      _status: 'not_yet_implemented',
      _note: 'Experimental decentralization history tracking will be added soon'
    }), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch experimental decentralization R2 history',
      details: e.message
    }), { status: 500, headers: cors });
  }
}
