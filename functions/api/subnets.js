export async function onRequest(context) {
  const kv = context.env.METRICS_KV || context.env.METRICS; // support both

  if (!kv) {
    return new Response(JSON.stringify({ error: 'KV binding missing (add METRICS_KV in Pages > Settings > Functions for Production + Preview).' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await kv.get('subnets', 'json');
    return new Response(JSON.stringify(data ?? { subnets: [] }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch subnets' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}