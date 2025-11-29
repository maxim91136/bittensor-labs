export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60, s-maxage=120'
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const KV = context.env?.METRICS_KV;
  if (!KV) {
    return new Response(JSON.stringify({ error: 'KV not bound' }), { status: 500, headers: cors });
  }

  try {
    if (context.request.method === 'GET') {
      const raw = await KV.get('taostats_history');
      if (!raw) {
        return new Response(JSON.stringify({ error: 'No Taostats history found', _source: 'taostats', _status: 'empty' }), {
          status: 404,
          headers: cors
        });
      }
      return new Response(raw, { status: 200, headers: cors });
    }

    if (context.request.method === 'POST') {
      // Optionally require a WRITE token to protect the endpoint
      const WRITE_TOKEN = context.env?.WRITE_TOKEN || null;
      if (WRITE_TOKEN) {
        const provided = context.request.headers.get('X-WRITE-TOKEN');
        if (!provided || provided !== WRITE_TOKEN) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
        }
      }

      // Parse incoming JSON. Accept an object or an array.
      let payload;
      try {
        payload = await context.request.json();
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: cors });
      }

      // Normalize to array of entries
      const newEntries = Array.isArray(payload) ? payload : [payload];
      // Read existing
      let current = [];
      const raw = await KV.get('taostats_history');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            current = parsed;
          } else if (parsed && typeof parsed === 'object') {
            // Support older/legacy buckets that stored a single object
            current = [parsed];
          }
        } catch (e) {
          // ignore parse error and start fresh
        }
      }

      // Merge sequentially: we keep current oldest->newest, then append newer ones
      const seen = new Set();
      for (const e of current) {
        const k = (e && e._timestamp) ? e._timestamp : JSON.stringify(e);
        seen.add(k);
      }
      for (const e of newEntries) {
        const k = (e && e._timestamp) ? e._timestamp : JSON.stringify(e);
        if (seen.has(k)) continue;
        // ensure entry has a timestamp
        if (e && !e._timestamp) {
          e._timestamp = new Date().toISOString();
        }
        current.push(e);
        seen.add(k);
      }

      // Bound max entries
      const maxEntries = parseInt(context.env?.HISTORY_MAX_ENTRIES || '10000', 10);
      if (current.length > maxEntries) current = current.slice(-maxEntries);

      try {
        await KV.put('taostats_history', JSON.stringify(current));
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Failed to write KV', details: e.message }), { status: 500, headers: cors });
      }

      return new Response(JSON.stringify({ success: true, written: newEntries.length, total: current.length }), { status: 200, headers: cors });
    }
    // unsupported method
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to fetch/append Taostats history', details: e.message }), {
      status: 500,
      headers: cors
    });
  }
}
