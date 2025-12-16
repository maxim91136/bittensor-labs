/**
 * Subnet Ranking Predictions API
 *
 * Returns probability predictions for which subnet will reach rank #1
 * by a specified target date.
 *
 * Query Parameters:
 *   ?target_date=YYYY-MM-DD  - Optional: specific target date (default: next default prediction)
 *   ?top_n=N                 - Optional: return only top N predictions (default: all)
 *   ?format=compact          - Optional: compact format without metadata
 *
 * Response:
 *   {
 *     target_date: "2026-01-01T00:00:00Z",
 *     confidence: "high|medium|low",
 *     predictions: [...],
 *     top_5_contenders: [...],
 *     market_insights: {...}
 *   }
 *
 * Example:
 *   GET /api/subnet_predictions
 *   GET /api/subnet_predictions?target_date=2026-01-01
 *   GET /api/subnet_predictions?top_n=10&format=compact
 */

export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=3600, s-maxage=7200'  // Cache 1-2 hours
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (context.request.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: cors }
    );
  }

  const KV = context.env?.METRICS_KV;
  if (!KV) {
    return new Response(
      JSON.stringify({ error: 'KV not bound' }),
      { status: 500, headers: cors }
    );
  }

  try {
    // Parse query parameters
    const url = new URL(context.request.url);
    const targetDate = url.searchParams.get('target_date');
    const topN = parseInt(url.searchParams.get('top_n') || '0', 10);
    const format = url.searchParams.get('format') || 'full';

    // Fetch predictions from KV
    const raw = await KV.get('subnet_predictions', { type: 'json' });

    if (!raw || !raw.predictions_by_date) {
      return new Response(
        JSON.stringify({
          error: 'No predictions available',
          message: 'Prediction system may still be initializing. Run the workflow manually or wait for the scheduled run.',
          _status: 'not_yet_generated'
        }),
        { status: 404, headers: cors }
      );
    }

    // Find matching prediction for target date
    let prediction;
    if (targetDate) {
      // Find closest match to requested date
      prediction = findClosestPrediction(raw.predictions_by_date, targetDate);
    } else {
      // Return first/default prediction
      prediction = raw.predictions_by_date[0];
    }

    if (!prediction) {
      return new Response(
        JSON.stringify({
          error: 'No prediction found for target date',
          available_dates: raw.predictions_by_date.map(p => p.target_date)
        }),
        { status: 404, headers: cors }
      );
    }

    // Apply top_n filter if requested
    let predictions = prediction.predictions;
    if (topN > 0 && topN < predictions.length) {
      predictions = predictions.slice(0, topN);
    }

    // Format response
    const response = {
      _source: 'subnet_predictions',
      _generated_at: raw._generated_at,
      model_version: raw.model_version,
      target_date: prediction.target_date,
      days_ahead: prediction.days_ahead,
      confidence: prediction.confidence,
      predictions: predictions,
      top_5_contenders: prediction.top_5_contenders,
    };

    // Include metadata if not compact
    if (format !== 'compact') {
      response.data_quality = prediction.data_quality;
      response.market_insights = prediction.market_insights;
      response.configuration = raw.configuration;
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: cors }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch predictions',
        details: e.message
      }),
      { status: 500, headers: cors }
    );
  }
}

/**
 * Find prediction closest to target date
 */
function findClosestPrediction(predictions, targetDateStr) {
  const target = new Date(targetDateStr).getTime();
  let closest = null;
  let minDiff = Infinity;

  for (const pred of predictions) {
    const predDate = new Date(pred.target_date).getTime();
    const diff = Math.abs(predDate - target);

    if (diff < minDiff) {
      minDiff = diff;
      closest = pred;
    }
  }

  return closest;
}
