export async function onRequest(context) {
  const { request, env } = context;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const primary = env.TAOSTATS_API_KEY;
    const backup  = env.TAOSTATS_API_KEY_BACKUP;
    if (!primary) {
      return new Response(JSON.stringify({ error: 'API key not configured (env.TAOSTATS_API_KEY missing)' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint') || 'network/stats';
    const target = `https://api.taostats.io/api/v1/${endpoint}`;

    const doFetch = (key) => fetch(target, { headers: { 'x-api-key': key }, cf: { cacheTtl: 30, cacheEverything: true } });

    let res = await doFetch(primary);
    if (!res.ok && backup && (res.status === 429 || res.status === 403)) {
      res = await doFetch(backup);
    }

    const text = await res.text();
    if (!res.ok) {
      // Taostats liefert oft JSON, aber wir geben den Body immer durch
      return new Response(JSON.stringify({ error: `Taostats ${res.status}`, body: safeJson(text) }), {
        status: res.status, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    return new Response(text, {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30, s-maxage=60' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Proxy failed', details: e.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
}
function safeJson(text) { try { return JSON.parse(text); } catch { return text; } }