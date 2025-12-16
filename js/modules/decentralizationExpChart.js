// ===== Experimental Decentralization Score History Chart Module =====
// Displays historical TDS/EDS/Hybrid score trends

let _chartInstance = null;

/**
 * Create/update the experimental decentralization score history chart
 * @param {Array} history - Array of history entries from API
 * @param {number} days - Number of days displayed
 */
export function createDecentralizationExpChart(history, days = 30) {
  const canvas = document.getElementById('decentralizationExpChart');
  if (!canvas) {
    console.warn('Experimental decentralization chart canvas not found');
    return;
  }

  const ctx = canvas.getContext('2d');

  // Destroy existing chart
  if (_chartInstance) {
    _chartInstance.destroy();
    _chartInstance = null;
  }

  if (!history || history.length === 0) {
    console.warn('No experimental decentralization history data available yet');
    // Show placeholder message in canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '14px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.textAlign = 'center';
    ctx.fillText('History tracking coming soon...', canvas.width / 2, canvas.height / 2);
    return;
  }

  // Prepare data
  const dates = history.map(e => e.date);
  const tdsScores = history.map(e => e.tds || 0);
  const edsScores = history.map(e => e.eds || 0);
  const hybridScores = history.map(e => e.hybrid || 0);

  // Color scheme matching the score cards
  const tdsColor = 'rgba(34, 197, 94, 1)';         // Green for TDS
  const edsColor = 'rgba(59, 130, 246, 1)';        // Blue for EDS
  const hybridColor = 'rgba(168, 85, 247, 1)';     // Purple for Hybrid

  _chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label: 'Hybrid Score',
          data: hybridScores,
          borderColor: hybridColor,
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: hybridColor
        },
        {
          label: 'TDS (Technical)',
          data: tdsScores,
          borderColor: tdsColor,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [5, 3],
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4
        },
        {
          label: 'EDS (Economic)',
          data: edsScores,
          borderColor: edsColor,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [5, 3],
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: 'rgba(255, 255, 255, 0.8)',
            font: {
              family: "'JetBrains Mono', 'Courier New', monospace",
              size: 11
            },
            usePointStyle: true,
            padding: 12
          }
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(10, 14, 18, 0.95)',
          titleColor: 'rgba(168, 85, 247, 1)',
          bodyColor: 'rgba(255, 255, 255, 0.9)',
          borderColor: 'rgba(168, 85, 247, 0.3)',
          borderWidth: 1,
          padding: 12,
          titleFont: {
            family: "'JetBrains Mono', monospace",
            size: 12,
            weight: 'bold'
          },
          bodyFont: {
            family: "'JetBrains Mono', monospace",
            size: 11
          },
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || '';
              const value = context.parsed.y.toFixed(1);
              return `${label}: ${value}/100`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'category',
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            drawBorder: false
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.6)',
            font: {
              family: "'JetBrains Mono', monospace",
              size: 10
            },
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: days > 90 ? 10 : 15
          }
        },
        y: {
          min: 0,
          max: 100,
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            drawBorder: false
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.6)',
            font: {
              family: "'JetBrains Mono', monospace",
              size: 10
            },
            callback: function(value) {
              return value + '/100';
            }
          },
          title: {
            display: true,
            text: 'Decentralization Score 2.0',
            color: 'rgba(255, 255, 255, 0.7)',
            font: {
              family: "'JetBrains Mono', monospace",
              size: 11,
              weight: 'bold'
            }
          }
        }
      }
    }
  });
}

/**
 * Load and display experimental decentralization score history
 * @param {number} days - Number of days to fetch (default: 30)
 */
export async function loadDecentralizationExpHistory(days = 30) {
  try {
    // Try KV history first
    const kvRes = await fetch('/api/decentralization_exp_history');
    if (kvRes.ok) {
      const data = await kvRes.json();
      const entries = data.entries || [];

      // Take last N days
      const filtered = entries.slice(0, days).reverse();

      if (filtered.length > 0) {
        createDecentralizationExpChart(filtered, days);
        console.log(`✅ Loaded ${filtered.length} days of experimental decentralization history from KV`);
        return;
      }
    }

    // Fallback to R2
    console.log('Trying R2 experimental history...');
    const r2Res = await fetch(`/api/decentralization_exp_r2_history?days=${days}`);
    if (r2Res.ok) {
      const data = await r2Res.json();
      const entries = data.entries || [];

      if (entries.length > 0) {
        createDecentralizationExpChart(entries, days);
        console.log(`✅ Loaded ${entries.length} days of experimental decentralization history from R2`);
        return;
      }
    }

    console.warn('No experimental decentralization history available');
  } catch (err) {
    console.error('Failed to load experimental decentralization history:', err);
  }
}

/**
 * Destroy chart instance
 */
export function destroyDecentralizationExpChart() {
  if (_chartInstance) {
    _chartInstance.destroy();
    _chartInstance = null;
  }
}
