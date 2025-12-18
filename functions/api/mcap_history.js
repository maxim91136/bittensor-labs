/**
 * Market Cap History API
 * Returns historical snapshots of Top 10 Subnets by Market Cap.
 *
 * Query params:
 *   ?limit=N    - Return only the last N entries (default: all)
 *   ?latest=1   - Return only the most recent snapshot
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

  if (context.request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });
  }

  const KV = context.env?.METRICS_KV;
  if (!KV) {
    return new Response(JSON.stringify({ error: 'KV not bound' }), { status: 500, headers: cors });
  }

  try {
    const raw = await KV.get('mcap_history');
    if (!raw) {
      return new Response(JSON.stringify({
        error: 'No mcap history found',
        _source: 'mcap_history',
        _status: 'empty',
        history: []
      }), {
        status: 200,
        headers: cors
      });
    }

    let history;
    try {
      history = JSON.parse(raw);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid history data' }), { status: 500, headers: cors });
    }

    if (!Array.isArray(history)) {
      history = [history];
    }

    // Parse query params
    const url = new URL(context.request.url);
    const latest = url.searchParams.get('latest') === '1';
    const limit = parseInt(url.searchParams.get('limit') || '0', 10);

    if (latest && history.length > 0) {
      return new Response(JSON.stringify({
        _source: 'mcap_history',
        _count: 1,
        snapshot: history[history.length - 1]
      }), { status: 200, headers: cors });
    }

    if (limit > 0 && limit < history.length) {
      history = history.slice(-limit);
    }

    return new Response(JSON.stringify({
      _source: 'mcap_history',
      _count: history.length,
      history: history
    }), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to fetch mcap history', details: e.message }), {
      status: 500,
      headers: cors
    });
  }
}
