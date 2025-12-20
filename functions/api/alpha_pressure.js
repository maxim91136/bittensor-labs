/**
 * Alpha Pressure API
 *
 * Measures net buying/selling pressure on subnet alpha tokens.
 * Alpha Pressure = (Net Flow 30d / Total Emission 30d) × 100
 *
 * Interpretation:
 * - > 100%: Market absorbs ALL emission + buying more (very bullish)
 * - 0-100%: Market absorbs part of emission (healthy)
 * - < 0%: Net selling pressure (bearish)
 */

export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=600'
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const KV = context.env?.METRICS_KV;
  if (!KV) {
    return new Response(JSON.stringify({ error: 'KV not bound' }), { status: 500, headers: cors });
  }

  // Parse query params
  const url = new URL(context.request.url);
  const filterNetuids = url.searchParams.get('netuids'); // comma-separated: "8,64,120"
  const sortBy = url.searchParams.get('sort') || 'pressure'; // pressure, emission, flow
  const limit = parseInt(url.searchParams.get('limit')) || 100;

  try {
    const topSubnets = await KV.get('top_subnets');
    if (!topSubnets) {
      return new Response(JSON.stringify({
        error: 'No subnet data found',
        _source: 'alpha-pressure',
        _status: 'empty'
      }), { status: 404, headers: cors });
    }

    const subnetsData = JSON.parse(topSubnets);
    const subnets = subnetsData.top_subnets || [];

    // Filter by netuids if provided
    let filteredSubnets = subnets;
    if (filterNetuids) {
      const netuidList = filterNetuids.split(',').map(n => parseInt(n.trim()));
      filteredSubnets = subnets.filter(s => netuidList.includes(s.netuid));
    }

    // Calculate Alpha Pressure for each subnet
    const alphaPressure = filteredSubnets.map(s => {
      const raw = s.taostats_raw || {};
      const emissionDaily = s.estimated_emission_daily || 0;
      const emission30d = emissionDaily * 30;
      const emission7d = emissionDaily * 7;

      // Net flows (convert from rao to TAO)
      const netFlow30d = parseInt(raw.net_flow_30_days || 0) / 1e9;
      const netFlow7d = parseInt(raw.net_flow_7_days || 0) / 1e9;
      const netFlow1d = parseInt(raw.net_flow_1_day || 0) / 1e9;

      // Alpha Pressure = (Net Flow / Emission) × 100
      const pressure30d = emission30d > 0 ? (netFlow30d / emission30d) * 100 : 0;
      const pressure7d = emission7d > 0 ? (netFlow7d / emission7d) * 100 : 0;

      // Trend: compare 7d daily rate vs 30d daily rate
      const dailyRate30d = netFlow30d / 30;
      const dailyRate7d = netFlow7d / 7;
      let trend = 'stable';
      let trendEmoji = '➡️';

      if (dailyRate7d > dailyRate30d * 1.2) {
        trend = 'improving';
        trendEmoji = '↗️';
      } else if (dailyRate7d < dailyRate30d * 0.8) {
        trend = 'declining';
        trendEmoji = '↘️';
      }

      // Special case: if 30d was positive but 7d is negative = reversing
      if (netFlow30d > 0 && netFlow7d < 0) {
        trend = 'reversing';
        trendEmoji = '⚠️';
      }

      // Status based on pressure
      let status, emoji;
      if (pressure30d >= 100) {
        status = 'strong_buy';
        emoji = '🟢';
      } else if (pressure30d >= 50) {
        status = 'accumulation';
        emoji = '🟢';
      } else if (pressure30d >= 0) {
        status = 'neutral';
        emoji = '🟡';
      } else if (pressure30d >= -50) {
        status = 'sell_pressure';
        emoji = '🟠';
      } else {
        status = 'heavy_selling';
        emoji = '🔴';
      }

      return {
        netuid: s.netuid,
        name: s.subnet_name,
        owner: raw.owner?.ss58 || null,
        owner_short: raw.owner?.ss58 ? `${raw.owner.ss58.slice(0,6)}...${raw.owner.ss58.slice(-4)}` : null,

        // Emission data
        emission_daily_tao: Math.round(emissionDaily * 100) / 100,
        emission_30d_tao: Math.round(emission30d),

        // Flow data
        net_flow_30d_tao: Math.round(netFlow30d),
        net_flow_7d_tao: Math.round(netFlow7d),
        net_flow_1d_tao: Math.round(netFlow1d),

        // Alpha Pressure metrics
        alpha_pressure_30d: Math.round(pressure30d * 10) / 10,
        alpha_pressure_7d: Math.round(pressure7d * 10) / 10,

        // Status
        status,
        emoji,
        trend,
        trend_emoji: trendEmoji
      };
    }).filter(s => s.emission_daily_tao > 0);

    // Sort
    if (sortBy === 'pressure') {
      alphaPressure.sort((a, b) => a.alpha_pressure_30d - b.alpha_pressure_30d);
    } else if (sortBy === 'emission') {
      alphaPressure.sort((a, b) => b.emission_daily_tao - a.emission_daily_tao);
    } else if (sortBy === 'flow') {
      alphaPressure.sort((a, b) => a.net_flow_30d_tao - b.net_flow_30d_tao);
    }

    // Apply limit
    const limited = alphaPressure.slice(0, limit);

    // Summary stats
    const summary = {
      strong_buy: limited.filter(s => s.status === 'strong_buy').length,
      accumulation: limited.filter(s => s.status === 'accumulation').length,
      neutral: limited.filter(s => s.status === 'neutral').length,
      sell_pressure: limited.filter(s => s.status === 'sell_pressure').length,
      heavy_selling: limited.filter(s => s.status === 'heavy_selling').length,
      improving: limited.filter(s => s.trend === 'improving').length,
      declining: limited.filter(s => s.trend === 'declining').length,
      reversing: limited.filter(s => s.trend === 'reversing').length
    };

    const result = {
      _timestamp: new Date().toISOString(),
      _source: 'alpha-pressure',
      _description: 'Alpha Pressure = (Net Flow / Emission) × 100. Positive = buying, Negative = selling.',
      total_subnets: limited.length,
      subnets: limited,
      summary
    };

    return new Response(JSON.stringify(result, null, 2), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Failed to calculate alpha pressure',
      details: e.message
    }), { status: 500, headers: cors });
  }
}
