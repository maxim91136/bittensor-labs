import * as topSubnets from './functions/api/top_subnets.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = { request, env, waitUntil: ctx.waitUntil };

    // Health endpoint
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Top subnets endpoint
    if (url.pathname === '/api/top_subnets' || url.pathname.startsWith('/api/top_subnets')) {
      if (typeof topSubnets.onRequest === 'function') return topSubnets.onRequest(context);
    }

    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
};
