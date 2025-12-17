// Alpha Prices API endpoint
// Serves subnet alpha token prices from KV (fetched by GitHub Action via Bittensor SDK)

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

    // Query params
    const url = new URL(request.url);
    const netuid = url.searchParams.get('netuid'); // Get specific subnet
    const top = url.searchParams.get('top');       // Get top N by price
    const sortBy = url.searchParams.get('sort');   // 'price', 'liquidity', 'tao_in'

    try {
        const raw = await KV.get('alpha_prices');
        if (!raw) {
            return new Response(JSON.stringify({
                error: 'No alpha prices data found',
                hint: 'Data is fetched every 30 minutes via Bittensor SDK',
                _source: 'alpha_prices'
            }), {
                status: 404,
                headers: cors
            });
        }

        const data = JSON.parse(raw);

        // Return specific subnet if requested
        if (netuid) {
            const subnet = data.subnets?.find(s => s.netuid === parseInt(netuid));
            if (!subnet) {
                return new Response(JSON.stringify({
                    error: `Subnet ${netuid} not found or has no alpha price data`,
                    _timestamp: data._timestamp
                }), {
                    status: 404,
                    headers: cors
                });
            }
            return new Response(JSON.stringify({
                ...subnet,
                _timestamp: data._timestamp,
                _source: data._source
            }), {
                status: 200,
                headers: cors
            });
        }

        // Sort if requested
        let subnets = [...(data.subnets || [])];
        if (sortBy === 'liquidity' || sortBy === 'pool_liquidity_tao') {
            subnets.sort((a, b) => (b.pool_liquidity_tao || 0) - (a.pool_liquidity_tao || 0));
        } else if (sortBy === 'tao_in') {
            subnets.sort((a, b) => (b.tao_in_pool || 0) - (a.tao_in_pool || 0));
        }
        // Default sort is by alpha_price (already sorted in fetch script)

        // Limit results if top is specified
        if (top) {
            const n = parseInt(top);
            if (!isNaN(n) && n > 0) {
                subnets = subnets.slice(0, n);
            }
        }

        // Return filtered/sorted data
        return new Response(JSON.stringify({
            _timestamp: data._timestamp,
            _source: data._source,
            _network: data._network,
            total_subnets: data.total_subnets,
            returned_subnets: subnets.length,
            subnets: subnets
        }), {
            status: 200,
            headers: cors
        });

    } catch (e) {
        return new Response(JSON.stringify({
            error: 'Failed to fetch alpha prices',
            details: e.message
        }), {
            status: 500,
            headers: cors
        });
    }
}
