// ===== API Configuration =====
const API_BASE = '/api';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const REFRESH_INTERVAL = 30000; // 30 Sekunden

// ===== State Management =====
let validatorsChart = null;
let priceChart = null;
let lastPrice = null;
let currentPriceRange = '7'; // Default: 7 days

// ===== Utility Functions =====
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString('en-US');
}

function formatPrice(price) {
  return `$${price.toFixed(2)}`;
}

function animatePriceChange(element, newPrice) {
  if (lastPrice === null) {
    lastPrice = newPrice;
    return;
  }
  
  if (newPrice > lastPrice) {
    element.classList.add('blink-green');
  } else if (newPrice < lastPrice) {
    element.classList.add('blink-red');
  }
  
  setTimeout(() => {
    element.classList.remove('blink-green', 'blink-red');
  }, 600);
  
  lastPrice = newPrice;
}

// ===== API Fetchers =====
async function fetchNetworkData() {
  try {
    const response = await fetch(`${API_BASE}/network`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Network response failed');
    return await response.json();
  } catch (error) {
    console.error('❌ Error fetching network data:', error);
    return null;
  }
}

async function fetchHistoryData() {
  try {
    const response = await fetch(`${API_BASE}/history`, { cache: 'no-store' });
    if (!response.ok) throw new Error('History response failed');
    return await response.json();
  } catch (error) {
    console.error('❌ Error fetching history:', error);
    return null;
  }
}

async function fetchTaoPrice() {
  try {
    const response = await fetch(
      `${COINGECKO_API}/simple/price?ids=bittensor&vs_currencies=usd&include_24hr_change=true`,
      { cache: 'no-store' }
    );
    if (!response.ok) throw new Error('CoinGecko API failed');
    const data = await response.json();
    return {
      price: data.bittensor.usd,
      change24h: data.bittensor.usd_24h_change
    };
  } catch (error) {
    console.error('❌ Error fetching TAO price:', error);
    return null;
  }
}

async function fetchPriceHistory(days = '7') {
  try {
    const response = await fetch(
      `${COINGECKO_API}/coins/bittensor/market_chart?vs_currency=usd&days=${days}`,
      { cache: 'no-store' }
    );
    if (!response.ok) throw new Error('Price history failed');
    const data = await response.json();
    return data.prices; // [[timestamp, price], ...]
  } catch (error) {
    console.error('❌ Error fetching price history:', error);
    return null;
  }
}

// ===== UI Updates =====
function updateNetworkStats(data) {
  if (!data) return;
  
  const blockHeight = document.getElementById('blockHeight');
  if (blockHeight) {
    blockHeight.textContent = formatNumber(data.blockHeight);
  }
  
  const validators = document.getElementById('validators');
  if (validators) {
    validators.textContent = formatNumber(data.validators);
  }
  
  const subnets = document.getElementById('subnets');
  if (subnets) {
    subnets.textContent = data.subnets;
  }
  
  const emission = document.getElementById('emission');
  if (emission) {
    emission.textContent = data.emission + ' τ/day';
  }
  
  const neurons = document.getElementById('totalNeurons');
  if (neurons) {
    neurons.textContent = formatNumber(data.totalNeurons);
  }
}

function updateTaoPrice(priceData) {
  if (!priceData) return;
  
  const priceElement = document.getElementById('taoPrice');
  const pillElement = document.getElementById('taoPricePill');
  
  if (priceElement) {
    priceElement.textContent = formatPrice(priceData.price);
    animatePriceChange(pillElement, priceData.price);
  }
}

// ===== Chart Creation =====
function createValidatorsChart(historyData) {
  const canvas = document.getElementById('validatorsChart');
  if (!canvas || !historyData || !Array.isArray(historyData) || historyData.length === 0) return;
  
  const ctx = canvas.getContext('2d');
  
  const labels = historyData.map(d => {
    const date = new Date(d.t * 1000);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  });
  
  const validatorsData = historyData.map(d => d.validators);
  
  if (validatorsChart) {
    validatorsChart.destroy();
  }
  
  validatorsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Active Validators',
        data: validatorsData,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#22c55e',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(17, 19, 24, 0.95)',
          titleColor: '#e8eaed',
          bodyColor: '#9ca3af',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (context) => `${context.parsed.y} validators`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { 
            color: '#9ca3af',
            maxTicksLimit: 6
          }
        },
        y: {
          grid: { 
            color: 'rgba(255,255,255,0.05)',
            drawBorder: false
          },
          ticks: { 
            color: '#9ca3af',
            callback: (value) => formatNumber(value)
          }
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      }
    }
  });
  
  canvas.closest('.dashboard-card').classList.remove('loading');
}

function createPriceChart(priceHistory, range = '7') {
  const canvas = document.getElementById('priceChart');
  if (!canvas || !priceHistory || !Array.isArray(priceHistory) || priceHistory.length === 0) return;
  
  const ctx = canvas.getContext('2d');
  
  // Format labels based on range
  const labels = priceHistory.map(p => {
    const date = new Date(p[0]);
    if (range === 'max' || range === '365') {
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } else if (range === '30') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  });
  
  const prices = priceHistory.map(p => p[1]);
  
  if (priceChart) {
    priceChart.destroy();
  }
  
  priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'TAO Price (USD)',
        data: prices,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#22c55e',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(17, 19, 24, 0.95)',
          titleColor: '#e8eaed',
          bodyColor: '#9ca3af',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (context) => `$${context.parsed.y.toFixed(2)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { 
            color: '#9ca3af',
            maxTicksLimit: 8
          }
        },
        y: {
          grid: { 
            color: 'rgba(255,255,255,0.05)',
            drawBorder: false
          },
          ticks: { 
            color: '#9ca3af',
            callback: (value) => `$${value.toFixed(0)}`
          }
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      }
    }
  });
  
  canvas.closest('.dashboard-card').classList.remove('loading');
}

// ===== Time Range Toggle =====
function setupTimeRangeToggle() {
  const buttons = document.querySelectorAll('.time-btn');
  
  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      // Update active state
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Get range
      const range = btn.dataset.range;
      currentPriceRange = range;
      
      // Show loading
      const card = document.querySelector('#priceChart').closest('.dashboard-card');
      card.classList.add('loading');
      
      // Fetch new data
      const priceHistory = await fetchPriceHistory(range);
      if (priceHistory) {
        createPriceChart(priceHistory, range);
      }
    });
  });
}

// ===== Data Refresh =====
async function refreshDashboard() {
  console.log('🔄 Refreshing dashboard data...');
  
  const [networkData, historyData, taoPrice, priceHistory] = await Promise.all([
    fetchNetworkData(),
    fetchHistoryData(),
    fetchTaoPrice(),
    fetchPriceHistory(currentPriceRange)
  ]);
  
  updateNetworkStats(networkData);
  updateTaoPrice(taoPrice);
  
  if (historyData && (!validatorsChart || historyData.length > 0)) {
    createValidatorsChart(historyData);
  }
  
  if (priceHistory && (!priceChart || priceHistory.length > 0)) {
    createPriceChart(priceHistory, currentPriceRange);
  }
  
  console.log('✅ Dashboard updated');
}

// ===== Initialization =====
async function initDashboard() {
  console.log('🚀 Initializing Bittensor-Labs Dashboard...');
  
  setupTimeRangeToggle();
  await refreshDashboard();
  
  setInterval(refreshDashboard, REFRESH_INTERVAL);
  
  console.log(`⏱️  Auto-refresh: every ${REFRESH_INTERVAL / 1000}s`);
}

// ===== Start on DOM Ready =====
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}