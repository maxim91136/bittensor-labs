export async function onRequest(context) {
  const { METRICS } = context.env;
  
  try {
    const data = await METRICS.get('subnets', 'json');
    
    return new Response(JSON.stringify(data || { subnets: [] }), {
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