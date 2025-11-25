// Cloudflare Worker: ATH & ATL fetch for TAO via Coingecko
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

  const COINGECKO_API = 'https://api.coingecko.com/api/v3/coins/bittensor';

  try {
    const res = await fetch(COINGECKO_API);
    if (!res.ok) throw new Error(`Coingecko API error: ${res.status}`);
    const data = await res.json();
    const ath = data?.market_data?.ath?.usd ?? null;
    const ath_date = data?.market_data?.ath_date?.usd ?? null;
    const atl = data?.market_data?.atl?.usd ?? null;
    const atl_date = data?.market_data?.atl_date?.usd ?? null;
    if (!ath && !atl) throw new Error('ATH and ATL not found');

    // Store ATH/ATL in KV
    const payload = { ath, ath_date, atl, atl_date, source: 'coingecko', updated: new Date().toISOString() };
    await KV.put('tao_ath_atl', JSON.stringify(payload));

    return new Response(JSON.stringify({ ...payload, _source: 'coingecko' }), { status: 200, headers: cors });
  } catch (e) {
    // Fallback: return last cached value from KV if available
    try {
      const cached = await KV.get('tao_ath_atl');
      if (cached) {
        const obj = JSON.parse(cached);
        return new Response(JSON.stringify({ ...obj, _source: 'coingecko-fallback', error: e.message }), { status: 200, headers: cors });
      }
    } catch (kvErr) {
      // ignore KV read error and fall through to error response
    }
    return new Response(JSON.stringify({ error: 'Failed to fetch ATH/ATL', details: e.message }), { status: 500, headers: cors });
  }
}
