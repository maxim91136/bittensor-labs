// ===== Decentralization Score History Chart Module =====
// Displays historical Network Decentralization Score trends

let _chartInstance = null;

/**
 * Create/update the decentralization score history chart
 * @param {Array} history - Array of history entries from API
 * @param {number} days - Number of days displayed
 */
export function createDecentralizationChart(history, days = 30) {
  const canvas = document.getElementById('decentralizationChart');
  if (!canvas) {
    console.warn('Decentralization chart canvas not found');
    return;
  }

  const ctx = canvas.getContext('2d');

  // Destroy existing chart
  if (_chartInstance) {
    _chartInstance.destroy();
    _chartInstance = null;
  }

  if (!history || history.length === 0) {
    console.warn('No decentralization history data');
    return;
  }

  // Prepare data
  const dates = history.map(e => e.date);
  const scores = history.map(e => e.score || 0);
  const walletScores = history.map(e => e.wallet_score || 0);
  const validatorScores = history.map(e => e.validator_score || 0);
  const subnetScores = history.map(e => e.subnet_score || 0);

  // Color scheme (terminal-style)
  const primaryColor = 'rgba(0, 255, 153, 1)';      // Bright cyan-green
  const walletColor = 'rgba(255, 107, 107, 0.8)';   // Red
  const validatorColor = 'rgba(78, 205, 196, 0.8)'; // Cyan
  const subnetColor = 'rgba(255, 195, 113, 0.8)';   // Orange

  _chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label: 'Network Dec Score',
          data: scores,
          borderColor: primaryColor,
          backgroundColor: 'rgba(0, 255, 153, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: primaryColor
        },
        {
          label: 'Wallet Score',
          data: walletScores,
          borderColor: walletColor,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [5, 3],
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4
        },
        {
          label: 'Validator Score',
          data: validatorScores,
          borderColor: validatorColor,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [5, 3],
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4
        },
        {
          label: 'Subnet Score',
          data: subnetScores,
          borderColor: subnetColor,
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
          titleColor: 'rgba(0, 255, 153, 1)',
          bodyColor: 'rgba(255, 255, 255, 0.9)',
          borderColor: 'rgba(0, 255, 153, 0.3)',
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
            text: 'Decentralization Score',
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
 * Load and display decentralization score history
 * @param {number} days - Number of days to fetch (default: 30)
 */
export async function loadDecentralizationHistory(days = 30) {
  try {
    // Try KV history first (fast, 365 days max)
    const kvRes = await fetch('/api/decentralization_history');
    if (kvRes.ok) {
      const data = await kvRes.json();
      const entries = data.entries || [];

      // Take last N days
      const filtered = entries.slice(0, days).reverse();

      if (filtered.length > 0) {
        createDecentralizationChart(filtered, days);
        console.log(`✅ Loaded ${filtered.length} days of decentralization history from KV`);
        return;
      }
    }

    // Fallback to R2 for longer ranges or if KV fails
    console.log('Trying R2 history...');
    const r2Res = await fetch(`/api/decentralization_r2_history?days=${days}`);
    if (r2Res.ok) {
      const data = await r2Res.json();
      const entries = data.entries || [];

      if (entries.length > 0) {
        createDecentralizationChart(entries, days);
        console.log(`✅ Loaded ${entries.length} days of decentralization history from R2`);
        return;
      }
    }

    console.warn('No decentralization history available');
  } catch (err) {
    console.error('Failed to load decentralization history:', err);
  }
}

/**
 * Destroy chart instance
 */
export function destroyDecentralizationChart() {
  if (_chartInstance) {
    _chartInstance.destroy();
    _chartInstance = null;
  }
}
