/**
 * Alpha Pressure History API
 *
 * Returns historical alpha pressure snapshots.
 * Query params:
 *   - limit: number of snapshots (default: 24 = ~6 days @ 6h intervals)
 *   - netuid: filter to specific subnet
 */

export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=600'
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const KV = context.env?.METRICS_KV;
  if (!KV) {
    return new Response(JSON.stringify({ error: 'KV not bound' }), { status: 500, headers: cors });
  }

  // Parse query params
  const url = new URL(context.request.url);
  const limit = parseInt(url.searchParams.get('limit')) || 24;
  const netuid = url.searchParams.get('netuid');

  try {
    const raw = await KV.get('alpha_pressure_history');
    if (!raw) {
      return new Response(JSON.stringify({
        error: 'No history data found',
        _source: 'alpha-pressure-history',
        _status: 'empty',
        history: []
      }), { status: 200, headers: cors });
    }

    let history = JSON.parse(raw);

    // Ensure it's an array
    if (!Array.isArray(history)) {
      history = [];
    }

    // Get latest N entries (newest first)
    let result = history.slice(-limit).reverse();

    // Filter by netuid if specified
    if (netuid) {
      result = result.map(snapshot => ({
        _timestamp: snapshot._timestamp,
        entries: snapshot.entries.filter(e => e.id === netuid),
        summary: snapshot.summary
      }));
    }

    return new Response(JSON.stringify({
      _source: 'alpha-pressure-history',
      total_snapshots: history.length,
      returned: result.length,
      history: result
    }, null, 2), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch history',
      details: e.message
    }), { status: 500, headers: cors });
  }
}
