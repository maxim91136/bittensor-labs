# Fear & Greed Index API endpoint for Cloudflare Worker
# Serves the latest index from KV as JSON

default_headers = [
    ("Content-Type", "application/json; charset=utf-8"),
    ("Access-Control-Allow-Origin", "*"),
]

async def handle_request(request, env):
    kv = env.METRICS_KV
    data = await kv.get("fear_and_greed_index")
    if not data:
        return Response('{"error": "No data"}', headers=default_headers, status=404)
    return Response(data, headers=default_headers)

exported = {
    "fetch": handle_request
}
