// Helper: Get date string for chunk key (YYYY-MM-DD)
function getChunkKey(date = new Date()) {
  const d = new Date(date);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `network_history_${yyyy}-${mm}-${dd}`;
}

// Helper: Get chunk keys for last N days
function getChunkKeys(days = 7) {
  const keys = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(getChunkKey(d));
  }
  return keys;
}

// Helper: Parse KV value to array
function parseHistory(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') return [parsed];
  } catch (e) { /* ignore */ }
  return [];
}

export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      const url = new URL(context.request.url);
      const days = Math.min(parseInt(url.searchParams.get('days') || '7', 10), 30);
      const limit = parseInt(url.searchParams.get('limit') || '0', 10);

      // Try to load chunked data first
      const chunkKeys = getChunkKeys(days);
      const chunks = await Promise.all(chunkKeys.map(k => KV.get(k)));

      let combined = [];
      let usedChunks = false;

      for (let i = 0; i < chunks.length; i++) {
        if (chunks[i]) {
          usedChunks = true;
          combined = combined.concat(parseHistory(chunks[i]));
        }
      }

      // Fallback to legacy single key if no chunks found
      if (!usedChunks) {
        const legacyRaw = await KV.get('network_history');
        if (legacyRaw) {
          combined = parseHistory(legacyRaw);
        }
      }

      if (combined.length === 0) {
        return new Response(JSON.stringify({ error: 'No Network history found', _source: 'network_history', _status: 'empty' }), {
          status: 404,
          headers: cors
        });
      }

      // Sort by timestamp and deduplicate
      const seen = new Set();
      combined = combined
        .filter(e => {
          const k = e?._timestamp || JSON.stringify(e);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .sort((a, b) => new Date(a._timestamp || 0) - new Date(b._timestamp || 0));

      // Apply limit if specified
      if (limit > 0 && combined.length > limit) {
        combined = combined.slice(-limit);
      }

      return new Response(JSON.stringify(combined), { status: 200, headers: cors });
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

      // Parse incoming JSON
      let payload;
      try {
        payload = await context.request.json();
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: cors });
      }

      // Normalize to array of entries
      const newEntries = Array.isArray(payload) ? payload : [payload];

      // Add timestamps if missing
      for (const e of newEntries) {
        if (e && !e._timestamp) {
          e._timestamp = new Date().toISOString();
        }
      }

      // Write to today's chunk only
      const todayKey = getChunkKey();

      // Read today's chunk
      let current = parseHistory(await KV.get(todayKey));

      // Merge with deduplication
      const seen = new Set(current.map(e => e?._timestamp || JSON.stringify(e)));
      for (const e of newEntries) {
        const k = e?._timestamp || JSON.stringify(e);
        if (seen.has(k)) continue;
        current.push(e);
        seen.add(k);
      }

      // Sort by timestamp
      current.sort((a, b) => new Date(a._timestamp || 0) - new Date(b._timestamp || 0));

      // Bound max entries per chunk (1 day = ~288 entries at 5min intervals)
      const maxPerChunk = parseInt(context.env?.CHUNK_MAX_ENTRIES || '500', 10);
      if (current.length > maxPerChunk) current = current.slice(-maxPerChunk);

      // Write to today's chunk
      await KV.put(todayKey, JSON.stringify(current));

      // Also write to legacy key for backward compatibility
      try {
        const legacyRaw = await KV.get('network_history');
        let legacy = parseHistory(legacyRaw);
        const legacySeen = new Set(legacy.map(e => e?._timestamp || JSON.stringify(e)));
        for (const e of newEntries) {
          const k = e?._timestamp || JSON.stringify(e);
          if (legacySeen.has(k)) continue;
          legacy.push(e);
        }
        legacy.sort((a, b) => new Date(a._timestamp || 0) - new Date(b._timestamp || 0));
        const maxLegacy = parseInt(context.env?.HISTORY_MAX_ENTRIES || '10000', 10);
        if (legacy.length > maxLegacy) legacy = legacy.slice(-maxLegacy);
        await KV.put('network_history', JSON.stringify(legacy));
      } catch (e) {
        console.error('Legacy KV write failed:', e.message);
      }

      return new Response(JSON.stringify({
        success: true,
        written: newEntries.length,
        chunk: todayKey,
        chunkTotal: current.length
      }), { status: 200, headers: cors });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to fetch Network history', details: e.message }), {
      status: 500,
      headers: cors
    });
  }
}
