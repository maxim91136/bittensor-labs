/**
 * API endpoint: /api/decentralization_r2_history
 * Returns long-range historical Network Decentralization Scores from R2.
 *
 * Query params:
 * - days: Number of days to fetch (default: 30, max: 365)
 * - start_date: YYYY-MM-DD (optional)
 * - end_date: YYYY-MM-DD (optional)
 *
 * Data source: R2 bucket (kv-backup) with daily snapshots
 */
export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  try {
    const R2 = context.env?.METRICS_R2; // R2 bucket binding
    const url = new URL(context.request.url);
    const days = Math.min(parseInt(url.searchParams.get('days') || '30'), 365);
    const start_date = url.searchParams.get('start_date');
    const end_date = url.searchParams.get('end_date');

    if (!R2) {
      return new Response(JSON.stringify({
        error: 'R2 not bound',
        _fallback: 'kv'
      }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // Build date range
    const dates = [];
    const now = new Date();

    if (start_date && end_date) {
      // Custom range
      let current = new Date(start_date);
      const end = new Date(end_date);
      while (current <= end) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
    } else {
      // Last N days
      for (let i = 0; i < days; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dates.push(d);
      }
    }

    // Fetch snapshots from R2
    const entries = [];
    let fetched = 0;
    let missing = 0;

    for (const date of dates) {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const key = `decentralization/${year}/${month}/${day}.json`;

      try {
        const obj = await R2.get(key);
        if (obj) {
          const data = await obj.json();
          entries.push({
            date: data.date || `${year}-${month}-${day}`,
            score: data.score,
            rating: data.rating,
            wallet_score: data.wallet_analysis?.wallet_score,
            validator_score: data.validator_analysis?.validator_score,
            subnet_score: data.subnet_analysis?.subnet_score,
            validator_nakamoto: data.validator_analysis?.nakamoto_coefficient,
            subnet_nakamoto: data.subnet_analysis?.nakamoto_coefficient,
          });
          fetched++;
        } else {
          missing++;
        }
      } catch (e) {
        missing++;
        // Silently skip missing dates
      }
    }

    // Sort by date ascending
    entries.sort((a, b) => a.date.localeCompare(b.date));

    return new Response(JSON.stringify({
      entries,
      stats: {
        requested: dates.length,
        fetched,
        missing
      },
      _source: 'r2',
      _range: {
        days: days,
        start: entries[0]?.date,
        end: entries[entries.length - 1]?.date
      }
    }), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600'  // 1 hour cache
      }
    });

  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch R2 history',
      details: e.message
    }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
}
