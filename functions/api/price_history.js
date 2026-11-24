export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=600'  // Cache 5 mins
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const KV = context.env?.METRICS_KV;
  if (!KV) {
    return new Response(JSON.stringify({ error: 'KV not bound' }), { status: 500, headers: cors });
  }

  try {
    // Get range parameter (7, 30, 60, 90, 365)
    const url = new URL(context.request.url);
    const range = url.searchParams.get('range') || '7';
    
    const raw = await KV.get('price_history');
    if (!raw) {
      return new Response(JSON.stringify({ 
        error: 'No price history found', 
        _source: 'taostats', 
        _status: 'empty' 
      }), {
        status: 404,
        headers: cors
      });
    }
    
    const data = JSON.parse(raw);
    
    // Return specific range or all data
    if (range === 'all') {
      return new Response(JSON.stringify(data), { status: 200, headers: cors });
    }
    
    // Return specific timeframe
    const rangeData = data.data?.[range];
    if (!rangeData) {
      return new Response(JSON.stringify({ 
        error: `No data for range ${range}`, 
        available: Object.keys(data.data || {}),
        _source: 'taostats'
      }), {
        status: 404,
        headers: cors
      });
    }
    
    // Return in CoinGecko-compatible format: { prices: [[ts, price], ...] }
    return new Response(JSON.stringify({
      prices: rangeData,
      _source: data._source || 'taostats',
      _timestamp: data._timestamp,
      range: range
    }), { status: 200, headers: cors });
    
  } catch (e) {
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch price history', 
      details: e.message 
    }), {
      status: 500,
      headers: cors
    });
  }
}
