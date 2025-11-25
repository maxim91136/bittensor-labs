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
}
  }

  const KV = context.env?.METRICS_KV;
  if (!KV) {
    return new Response(JSON.stringify({ error: 'KV not bound' }), { status: 500, headers: cors });
  }

  const COINGECKO_API = 'https://api.coingecko.com/api/v3/coins/bittensor';

  // KV-first: prefer the cached value in Cloudflare KV for stability.
  try {
    const cached = await KV.get('tao_ath_atl');
    if (cached) {
      try {
        const obj = JSON.parse(cached);
        return new Response(JSON.stringify({ ...obj, _source: 'kv' }), { status: 200, headers: cors });
      } catch (parseErr) {
        // If cached payload is malformed, fall through to live fetch
        // and overwrite the KV entry with a fresh value when possible.
        console.warn && console.warn('ath-atl: cached KV parse error', parseErr?.message || parseErr);
      }
    }
  } catch (kvReadErr) {
    // If KV read fails, ignore and try live fetch — we don't want KV read errors
    // to block the endpoint entirely.
    console.warn && console.warn('ath-atl: KV read error', kvReadErr?.message || kvReadErr);
  }

  // No usable cached value — perform live fetch and store result in KV.
  try {
    const res = await fetch(COINGECKO_API);
    if (!res.ok) throw new Error(`Coingecko API error: ${res.status}`);
    const data = await res.json();
    const ath = data?.market_data?.ath?.usd ?? null;
    const ath_date = data?.market_data?.ath_date?.usd ?? null;
    const atl = data?.market_data?.atl?.usd ?? null;
    const atl_date = data?.market_data?.atl_date?.usd ?? null;
    if (!ath && !atl) throw new Error('ATH and ATL not found');

    const payload = { ath, ath_date, atl, atl_date, source: 'coingecko', updated: new Date().toISOString() };
    try {
      // Write-if-newer: only overwrite KV if our payload is newer than existing entry.
      let doWrite = true;
      try {
        const existingRaw = await KV.get('tao_ath_atl');
        if (existingRaw) {
          try {
            const existing = JSON.parse(existingRaw);
            if (existing && existing.updated) {
              const existingTs = Date.parse(existing.updated);
              const newTs = Date.parse(payload.updated);
              if (!isNaN(existingTs) && !isNaN(newTs) && newTs <= existingTs) {
                doWrite = false;
              }
            }
          } catch (parseErr) {
            // malformed existing value — fall through and overwrite
            console.warn && console.warn('ath-atl: existing KV parse error, will overwrite', parseErr?.message || parseErr);
            doWrite = true;
          }
        }
      } catch (kvReadErr) {
        // If KV read fails, allow write (best effort)
        console.warn && console.warn('ath-atl: KV read error before write-if-newer check', kvReadErr?.message || kvReadErr);
        doWrite = true;
      }
      if (doWrite) await KV.put('tao_ath_atl', JSON.stringify(payload));
      else console.warn && console.warn('ath-atl: skipping KV write; existing entry is newer or equal');
    } catch (kvWriteErr) {
      console.warn && console.warn('ath-atl: KV write error', kvWriteErr?.message || kvWriteErr);
    }

    return new Response(JSON.stringify({ ...payload, _source: 'coingecko' }), { status: 200, headers: cors });
  } catch (e) {
    // If live fetch fails, try to return last cached value (if any) before erroring.
    try {
      const cached = await KV.get('tao_ath_atl');
      if (cached) {
        const obj = JSON.parse(cached);
        return new Response(JSON.stringify({ ...obj, _source: 'coingecko-fallback', error: e.message }), { status: 200, headers: cors });
      }
    } catch (kvErr) {
      // ignore and fall through
    }
    return new Response(JSON.stringify({ error: 'Failed to fetch ATH/ATL', details: e.message }), { status: 500, headers: cors });
  }
}
