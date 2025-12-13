// CoinMarketCap data API endpoint
// Serves CMC data from KV (fetched by GitHub Action)

export async function onRequest(context) {
    const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=120'
    };

    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: cors });
    }

    const KV = env?.METRICS_KV;
    if (!KV) {
        return new Response(JSON.stringify({ error: 'KV not bound' }), { status: 500, headers: cors });
    }

    // Check for specific data type query param
    const url = new URL(request.url);
    const dataType = url.searchParams.get('type'); // 'fng', 'tao', 'global', or null for all

    try {
        const raw = await KV.get('cmc_data');
        if (!raw) {
            return new Response(JSON.stringify({ error: 'No CMC data found', _source: 'cmc' }), {
                status: 404,
                headers: cors
            });
        }

        const data = JSON.parse(raw);

        // Return specific data type if requested
        if (dataType === 'fng' || dataType === 'fear_and_greed') {
            return new Response(JSON.stringify(data.fear_and_greed || { error: 'No F&G data' }), {
                status: data.fear_and_greed ? 200 : 404,
                headers: cors
            });
        }
        if (dataType === 'tao' || dataType === 'quote') {
            return new Response(JSON.stringify(data.tao_quote || { error: 'No TAO data' }), {
                status: data.tao_quote ? 200 : 404,
                headers: cors
            });
        }
        if (dataType === 'global') {
            return new Response(JSON.stringify(data.global_metrics || { error: 'No global data' }), {
                status: data.global_metrics ? 200 : 404,
                headers: cors
            });
        }

        // Return all data
        return new Response(raw, { status: 200, headers: cors });
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Failed to fetch CMC data', details: e.message }), {
            status: 500,
            headers: cors
        });
    }
}
