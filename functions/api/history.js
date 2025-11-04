export async function onRequest(context) {
  const { env } = context;
  try {
    const raw = await env.METRICS_KV.get('history');
    return new Response(raw || '[]', {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return new Response('[]', {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}