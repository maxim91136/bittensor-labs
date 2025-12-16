// ===== Price Chart Module (ES6) =====
// TAO price chart with comparison overlays (BTC, ETH, SOL), candlestick, and volume

// Module-level chart config (updated via setChartConfig)
let _chartConfig = {
  showBtcComparison: false,
  showEthComparison: false,
  showSolComparison: false,
  showEurPrices: false,
  showCandleChart: false,
  showVolume: false,
  eurUsdRate: null
};

// Lock to prevent concurrent chart refreshes
let _isChartRefreshing = false;

/**
 * Update chart configuration
 * @param {Object} config - Configuration options
 */
export function setChartConfig(config) {
  _chartConfig = { ..._chartConfig, ...config };
}

/**
 * Get current chart configuration
 * @returns {Object} Current config
 */
export function getChartConfig() {
  return { ..._chartConfig };
}

/**
 * Check if chart refresh is in progress
 * @returns {boolean}
 */
export function isChartRefreshing() {
  return _isChartRefreshing;
}

/**
 * Refresh the price chart with proper locking
 * @param {Object} options - Refresh options
 * @param {string} options.range - Price range (e.g., '3', '7', 'max')
 * @param {Function} options.fetchPriceHistory - Function to fetch TAO price history
 * @param {Function} options.fetchBtcPriceHistory - Function to fetch BTC price history
 * @param {Function} options.fetchEthPriceHistory - Function to fetch ETH price history
 * @param {Function} options.fetchSolPriceHistory - Function to fetch SOL price history
 */
export async function refreshPriceChart(options) {
  const {
    range,
    fetchPriceHistory,
    fetchBtcPriceHistory,
    fetchEthPriceHistory,
    fetchSolPriceHistory
  } = options;

  // Prevent concurrent refreshes
  if (_isChartRefreshing) {
    if (window._debug) console.debug('Chart refresh already in progress, skipping');
    return;
  }
  _isChartRefreshing = true;

  const priceCard = document.querySelector('#priceChart')?.closest('.dashboard-card');
  if (priceCard) priceCard.classList.add('loading');

  try {
    const priceHistory = await fetchPriceHistory(range);
    const [btcHistory, ethHistory, solHistory] = await Promise.all([
      _chartConfig.showBtcComparison ? fetchBtcPriceHistory(range) : null,
      _chartConfig.showEthComparison ? fetchEthPriceHistory(range) : null,
      _chartConfig.showSolComparison ? fetchSolPriceHistory(range) : null
    ]);
    if (priceHistory) {
      createPriceChart(priceHistory, range, { btcHistory, ethHistory, solHistory });
    }
  } catch (e) {
    console.error('Error refreshing price chart:', e);
  } finally {
    if (priceCard) priceCard.classList.remove('loading');
    _isChartRefreshing = false;
  }
}

/**
 * Create or update the price chart
 * @param {Array|Object} priceHistoryData - Price history data (array or { prices, ohlcv, volume })
 * @param {string} range - Time range (e.g., '3', '7', 'max')
 * @param {Object} comparisonData - Comparison data { btcHistory, ethHistory, solHistory }
 */
export function createPriceChart(priceHistoryData, range, comparisonData = {}) {
  const canvas = document.getElementById('priceChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Handle new object format { prices, ohlcv, volume } or legacy array format
  const priceHistory = Array.isArray(priceHistoryData) ? priceHistoryData : priceHistoryData?.prices;
  const ohlcvData = priceHistoryData?.ohlcv || null;
  const volumeData = priceHistoryData?.volume || null;
  const dataSource = priceHistoryData?.source || 'unknown';

  if (!priceHistory?.length) return;

  // Read config values
  const {
    showBtcComparison,
    showEthComparison,
    showSolComparison,
    showEurPrices,
    showCandleChart,
    showVolume,
    eurUsdRate
  } = _chartConfig;

  // Extract comparison histories
  const { btcHistory, ethHistory, solHistory } = comparisonData;
  const hasAnyComparison = (showBtcComparison && btcHistory?.length) ||
                           (showEthComparison && ethHistory?.length) ||
                           (showSolComparison && solHistory?.length);

  // Format labels based on timeframe
  const isMax = range === 'max';
  const rangeNum = isMax ? priceHistory.length : (parseInt(range, 10) || 7);
  const labels = priceHistory.map(([timestamp]) => {
    const date = new Date(timestamp);
    if (rangeNum <= 1) {
      // 1 day: show time only
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    } else if (rangeNum === 2) {
      // 2 days: show date + time (original format)
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
             date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    } else if (rangeNum === 3) {
      // 3 days: show compact M/D format (ONLY CHANGE FROM ORIGINAL)
      return `${date.getMonth()+1}/${date.getDate()}`;
    } else if (rangeNum <= 30) {
      // Up to 30 days: M/D format
      return `${date.getMonth()+1}/${date.getDate()}`;
    } else if (rangeNum <= 180) {
      // 31-180 days: "Jan 15" format
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      // 180+ days (Max): "Apr '24" format
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const year = String(date.getFullYear()).slice(-2);
      return `${month} '${year}`;
    }
  });

  // Only destroy if chart object and method exist
  if (window.priceChart && typeof window.priceChart.destroy === 'function') {
    window.priceChart.destroy();
  }

  // Build datasets
  const datasets = [];

  // Helper: align comparison data to TAO timestamps
  function alignToTao(history) {
    if (!history?.length) return null;
    const map = new Map(history.map(([ts, price]) => [Math.floor(ts / 60000), price]));
    return priceHistory.map(([ts]) => {
      const key = Math.floor(ts / 60000);
      for (let i = 0; i <= 30; i++) {
        if (map.has(key - i)) return map.get(key - i);
        if (map.has(key + i)) return map.get(key + i);
      }
      return null;
    });
  }

  // Helper: normalize to % change from first valid value
  function normalizeToPercent(aligned) {
    if (!aligned) return null;
    const startIdx = aligned.findIndex(v => v !== null);
    const start = aligned[startIdx] || 1;
    return aligned.map(price => price !== null ? ((price - start) / start) * 100 : null);
  }

  // If any comparison enabled, normalize all to % change
  if (hasAnyComparison) {
    // Normalize TAO: % change from first value
    const taoStart = priceHistory[0]?.[1] || 1;
    const taoNormalized = priceHistory.map(([_, price]) => ((price - taoStart) / taoStart) * 100);

    datasets.push({
      label: 'TAO %',
      data: taoNormalized,
      borderColor: '#22c55e',
      backgroundColor: 'rgba(34,197,94,0.1)',
      tension: 0.2,
      pointRadius: 0,
      fill: true,
      yAxisID: 'y'
    });

    // Add BTC comparison
    if (showBtcComparison && btcHistory?.length) {
      const btcNormalized = normalizeToPercent(alignToTao(btcHistory));
      datasets.push({
        label: 'BTC %',
        data: btcNormalized,
        borderColor: '#f7931a',
        backgroundColor: 'rgba(247,147,26,0.05)',
        tension: 0.2,
        pointRadius: 0,
        fill: false,
        borderDash: [5, 5],
        yAxisID: 'y'
      });
    }

    // Add ETH comparison (gray/silver, darker in light mode)
    if (showEthComparison && ethHistory?.length) {
      const ethNormalized = normalizeToPercent(alignToTao(ethHistory));
      const isLightMode = document.body.classList.contains('light-bg');
      const ethColor = isLightMode ? '#555' : '#b0b0b0';
      datasets.push({
        label: 'ETH %',
        data: ethNormalized,
        borderColor: ethColor,
        backgroundColor: isLightMode ? 'rgba(85,85,85,0.05)' : 'rgba(160,160,160,0.05)',
        tension: 0.2,
        pointRadius: 0,
        fill: false,
        borderDash: [5, 5],
        yAxisID: 'y'
      });
    }

    // Add SOL comparison (purple)
    if (showSolComparison && solHistory?.length) {
      const solNormalized = normalizeToPercent(alignToTao(solHistory));
      datasets.push({
        label: 'SOL %',
        data: solNormalized,
        borderColor: '#9945ff',
        backgroundColor: 'rgba(153,69,255,0.05)',
        tension: 0.2,
        pointRadius: 0,
        fill: false,
        borderDash: [5, 5],
        yAxisID: 'y'
      });
    }
  } else {
    // Standard TAO price chart (USD or EUR)
    const conversionRate = showEurPrices && eurUsdRate ? (1 / eurUsdRate) : 1;
    const currencyLabel = showEurPrices ? 'TAO Price (EUR)' : 'TAO Price (USD)';

    // Check if candlestick mode and OHLCV data available
    if (showCandleChart && ohlcvData?.length) {
      // Candlestick chart data format
      const candleData = ohlcvData.map(d => ({
        x: d.x,
        o: d.o * conversionRate,
        h: d.h * conversionRate,
        l: d.l * conversionRate,
        c: d.c * conversionRate
      }));
      datasets.push({
        label: currencyLabel,
        data: candleData,
        color: {
          up: '#22c55e',
          down: '#ef4444',
          unchanged: '#888'
        },
        borderColor: {
          up: '#22c55e',
          down: '#ef4444',
          unchanged: '#888'
        }
      });
    } else {
      // Line chart (default)
      const data = priceHistory.map(([_, price]) => price * conversionRate);
      datasets.push({
        label: currencyLabel,
        data,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.1)',
        tension: 0.2,
        pointRadius: 0,
        fill: true
      });
    }
  }

  const showLegend = hasAnyComparison;
  const currencySymbol = (!showLegend && showEurPrices) ? '€' : '$';

  // Determine chart type
  const useCandlestick = showCandleChart && ohlcvData?.length && !hasAnyComparison;
  const chartType = useCandlestick ? 'candlestick' : 'line';

  // Add volume bars if enabled and data available
  if (showVolume && volumeData?.length && !hasAnyComparison) {
    // Find max volume for scaling
    const maxVol = Math.max(...volumeData.map(v => v.y));
    const volumeScaled = useCandlestick
      ? volumeData.map(v => ({ x: v.x, y: v.y }))
      : volumeData.map((v, i) => v.y);

    datasets.push({
      label: 'Volume',
      data: volumeScaled,
      type: 'bar',
      backgroundColor: 'rgba(100, 116, 139, 0.3)',
      borderColor: 'rgba(100, 116, 139, 0.5)',
      borderWidth: 1,
      yAxisID: 'yVolume',
      order: 2 // Draw behind price
    });
  }

  // Configure scales based on chart type
  const scales = useCandlestick ? {
    x: {
      type: 'time',
      time: {
        unit: rangeNum <= 1 ? 'hour' : (rangeNum <= 7 ? 'day' : (rangeNum <= 90 ? 'week' : 'month')),
        displayFormats: {
          hour: 'HH:mm',
          day: 'MMM d',
          week: 'MMM d',
          month: "MMM ''yy"
        }
      },
      grid: { display: false },
      ticks: { color: '#888', maxRotation: 0 }
    },
    y: {
      display: true,
      position: 'left',
      grid: { color: '#222' },
      ticks: {
        color: '#888',
        callback: function(value) {
          return `${currencySymbol}${value.toLocaleString()}`;
        }
      }
    }
  } : {
    x: {
      display: true,
      grid: { display: false },
      ticks: {
        color: '#888',
        maxTicksLimit: isMax ? 12 : (rangeNum <= 7 ? 7 : 15),
        autoSkip: true,
        maxRotation: 0
      }
    },
    y: {
      display: true,
      grid: { color: '#222' },
      ticks: {
        color: '#888',
        callback: function(value) {
          if (showLegend) return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
          return `${currencySymbol}${value.toLocaleString()}`;
        }
      }
    }
  };

  // Add volume scale if needed
  if (showVolume && volumeData?.length && !hasAnyComparison) {
    scales.yVolume = {
      display: false,
      position: 'right',
      grid: { display: false },
      min: 0,
      max: Math.max(...volumeData.map(v => v.y)) * 4 // Scale down volume to 25% of chart height
    };
  }

  window.priceChart = new Chart(ctx, {
    type: chartType,
    data: useCandlestick ? { datasets } : { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: showLegend || (showVolume && volumeData?.length),
          position: 'top',
          labels: { color: '#aaa', font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              // Volume tooltip
              if (context.dataset.label === 'Volume') {
                return `Vol: ${context.parsed.y?.toLocaleString() || 'N/A'}`;
              }
              // Candlestick tooltip
              if (useCandlestick && context.raw?.o !== undefined) {
                const d = context.raw;
                return [
                  `O: ${currencySymbol}${d.o.toFixed(2)}`,
                  `H: ${currencySymbol}${d.h.toFixed(2)}`,
                  `L: ${currencySymbol}${d.l.toFixed(2)}`,
                  `C: ${currencySymbol}${d.c.toFixed(2)}`
                ];
              }
              // Line chart tooltip
              const val = context.parsed.y;
              if (showLegend) {
                return `${context.dataset.label}: ${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
              }
              return `${currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales
    }
  });
}
