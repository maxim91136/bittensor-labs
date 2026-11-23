// Cloudflare Pages Function: Same-origin proxy for public price data (GDPR: the visitor's browser
// no longer connects to Binance or CoinGecko directly, only this site's server does).
// Strict allowlist: fixed hosts, fixed paths, only whitelisted query parameters with validated values.

const UPSTREAM = {
  // data-api.binance.vision serves public market data without the geo-block of api.binance.com
  binance: { base: 'https://data-api.binance.vision/api/v3', ttl: 20,
    paths: { 'ticker/24hr': ['symbol'], 'ticker/price': ['symbol'], 'klines': ['symbol', 'interval', 'limit'] } },
  coingecko: { base: 'https://api.coingecko.com/api/v3', ttl: 120,
    paths: {
      'simple/price': ['ids', 'vs_currencies', 'include_24hr_change'],
      'coins/bittensor': [],
      'coins/bittensor/market_chart': ['vs_currency', 'days', 'interval'],
      'coins/bitcoin/market_chart': ['vs_currency', 'days', 'interval']
    } }
};
const VALUE = /^[A-Za-z0-9_,.\-]{1,40}$/;

const json = (body, status, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra }
});

export async function onRequestGet(context) {
  const parts = [].concat(context.params.path || []);
  const up = UPSTREAM[parts[0]];
  const sub = parts.slice(1).join('/');
  if (!up || !Object.prototype.hasOwnProperty.call(up.paths, sub)) return json({ error: 'not allowed' }, 404);

  const url = new URL(context.request.url);
  const q = new URLSearchParams();
  for (const key of up.paths[sub]) {
    const v = url.searchParams.get(key);
    if (v === null) continue;
    if (!VALUE.test(v)) return json({ error: 'bad parameter' }, 400);
    q.set(key, v);
  }
  const target = `${up.base}/${sub}${q.toString() ? '?' + q.toString() : ''}`;

  const cache = caches.default;
  const cacheKey = new Request(`https://px.cache/${parts[0]}/${sub}?${q.toString()}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let res;
  try {
    res = await fetch(target, { headers: { Accept: 'application/json', 'User-Agent': 'bittensor-labs-proxy' } });
  } catch (e) {
    return json({ error: 'upstream unreachable' }, 502);
  }
  const body = await res.text();
  const out = new Response(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${up.ttl}` }
  });
  if (res.ok) context.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
}
