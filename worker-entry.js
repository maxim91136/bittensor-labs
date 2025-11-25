import * as ath from './functions/api/ath-atl.js';
import * as athHealth from './functions/api/ath-atl-health.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = { request, env, waitUntil: ctx.waitUntil };

    // Health endpoint
    if (url.pathname === '/api/ath-atl/health' || url.pathname.startsWith('/api/ath-atl/health')) {
      if (typeof athHealth.onRequest === 'function') return athHealth.onRequest(context);
    }

    // ATH/ATL endpoint
    if (url.pathname === '/api/ath-atl' || url.pathname.startsWith('/api/ath-atl')) {
      if (typeof ath.onRequest === 'function') return ath.onRequest(context);
    }

    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
};
