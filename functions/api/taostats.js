export async function onRequest(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = env.TAOSTATS_API_KEY;
    const backupKey = env.TAOSTATS_API_KEY_BACKUP;
    
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);
    const endpoint = url.searchParams.get('endpoint') || 'network/stats';
    const taostatsUrl = `https://api.taostats.io/api/v1/${endpoint}`;
    
    // Try primary key
    let response = await fetch(taostatsUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      cf: {
        cacheTtl: 30,
        cacheEverything: true,
      }
    });

    // Fallback to backup key on rate limit or auth error
    if (!response.ok && backupKey && (response.status === 429 || response.status === 403)) {
      console.log(`Primary key failed (${response.status}), trying backup...`);
      
      response = await fetch(taostatsUrl, {
        method: 'GET',
        headers: {
          'x-api-key': backupKey,
          'Content-Type': 'application/json',
        },
        cf: {
          cacheTtl: 30,
          cacheEverything: true,
        }
      });
    }

    if (!response.ok) {
      throw new Error(`Taostats API error: ${response.status}`);
    }

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30, s-maxage=60',
      }
    });

  } catch (error) {
    console.error('Taostats proxy error:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch from Taostats',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}