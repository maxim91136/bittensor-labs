// ===== API Configuration =====
const API_BASE = '/api';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const REFRESH_INTERVAL = 60000;
const PRICE_CACHE_TTL = 300000;
const PRICE_CACHE_TTL_MAX = 3600000;

// ===== State Management =====
let validatorsChart = null;
let priceChart = null;
let lastPrice = null;
let currentPriceRange = '7';
let isLoadingPrice = false;

// ===== Utility Functions =====
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return Number(num).toLocaleString('en-US');
}

function formatFull(num) {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return Math.round(Number(num)).toLocaleString('en-US');
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

function normalizeRange(raw) {
  const r = String(raw ?? '').trim().toLowerCase();
  if (r === '1y' || r === '1yr' || r === 'year') return '365';
  return r;
}

// ===== LocalStorage Cache Helpers =====
function getCachedPrice(range) {
  try {
    const cached = localStorage.getItem(`tao_price_${range}`);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;
    const ttl = (range === '365') ? PRICE_CACHE_TTL_MAX : PRICE_CACHE_TTL;
    if (age < ttl) return data;
    localStorage.removeItem(`tao_price_${range}`);
    return null;
  } catch { return null; }
}

function setCachedPrice(range, data) {
  try {
    localStorage.setItem(`tao_price_${range}`, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.warn('⚠️  Could not cache price data:', error);
  }
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

async function fetchPriceHistory(range = '7') {
  const key = normalizeRange(range);
  const cached = getCachedPrice?.(key);
  if (cached) return cached;

  const endpoint =
    key === '365'
      ? `${COINGECKO_API}/coins/bittensor/market_chart?vs_currency=usd&days=365&interval=daily`
      : key === '30'
      ? `${COINGECKO_API}/coins/bittensor/market_chart?vs_currency=usd&days=30&interval=daily`
      : `${COINGECKO_API}/coins/bittensor/market_chart?vs_currency=usd&days=7`;

  try {
    const res = await fetch(endpoint, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.prices?.length) return null;
    setCachedPrice?.(key, data.prices);
    return data.prices;
  } catch { return null; }
}

// ===== UI Updates =====
function updateNetworkStats(data) {
  if (!data) return;

  const blockHeight = document.getElementById('blockHeight');
  if (blockHeight) blockHeight.textContent = formatFull(data.blockHeight);

  const validators = document.getElementById('validators');
  if (validators) validators.textContent = formatFull(data.validators);

  const subnets = document.getElementById('subnets');
  if (subnets) subnets.textContent = formatFull(data.subnets);

  const neurons = document.getElementById('totalNeurons');
  if (neurons) neurons.textContent = formatFull(data.totalNeurons);

  // FIX: Emission kommt als String "7,200" – direkt anzeigen, nicht formatieren
  const emissionEl = document.getElementById('emission');
  if (emissionEl && data.emission) {
    emissionEl.textContent = `${data.emission} τ/day`;
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

function setPriceRangeNote(range) {
  const el = document.getElementById('priceRangeNote');
  if (!el) return;
  if (range === '365') {
    el.textContent = 'Showing last 365 days (CoinGecko free tier limit).';
  } else {
    el.textContent = '';
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
          ticks: { color: '#9ca3af', maxTicksLimit: 6 }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
          ticks: {
            color: '#9ca3af',
            callback: (value) => formatFull(value) // volle Zahlen
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
  if (!canvas || !priceHistory || !Array.isArray(priceHistory) || priceHistory.length === 0) {
    console.warn('⚠️  Cannot create price chart: invalid data');
    return;
  }
  
  const ctx = canvas.getContext('2d');
  
  // Format labels based on range
  const labels = priceHistory.map((p, index) => {
    const date = new Date(p[0]);
    
    if (range === 'max' || range === '365') {
      const step = Math.ceil(priceHistory.length / 12);
      if (index % step !== 0 && index !== priceHistory.length - 1) {
        return '';
      }
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    } else if (range === '30') {
      const step = Math.ceil(priceHistory.length / 10);
      if (index % step !== 0 && index !== priceHistory.length - 1) {
        return '';
      }
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
        pointHoverRadius: 4,
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
        // Decimation für große Datensätze
        decimation: { enabled: true, algorithm: 'lttb', samples: 400 },
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
            title: (context) => {
              const date = new Date(priceHistory[context[0].dataIndex][0]);
              return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              });
            },
            label: (context) => `$${context.parsed.y.toFixed(2)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { 
            color: '#9ca3af',
            maxRotation: 0,
            autoSkip: true,
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
  
  canvas.closest('.dashboard-card')?.classList.remove('loading');
  setPriceRangeNote(range);
}

// ===== Time Range Toggle (vereinfacht mit Lock) =====
function setupTimeRangeToggle() {
  const buttons = document.querySelectorAll('.time-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      // Simple Lock: verhindert parallele Requests
      if (isLoadingPrice) {
        console.log('⏳ Already loading, please wait...');
        return;
      }
      
      // Update active state
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const raw = e.currentTarget?.dataset?.range;
      const norm = normalizeRange(raw); // '7' | '30' | '365'
      currentPriceRange = norm;
      
      const card = document.querySelector('#priceChart')?.closest('.dashboard-card');
      if (card) {
        card.classList.add('loading');
      }
      
      isLoadingPrice = true;
      
      try {
        const priceHistory = await fetchPriceHistory(currentPriceRange);
        if (priceHistory) {
          createPriceChart(priceHistory, currentPriceRange);
          setPriceRangeNote(currentPriceRange);
        } else {
          console.warn('⚠️  No price history received');
        }
      } catch (error) {
        console.error('❌ Error loading price chart:', error);
      } finally {
        if (card) {
          card.classList.remove('loading');
        }
        isLoadingPrice = false;
      }
    });
  });
}

function setupMaxTooltip() {
  const btnMax = document.querySelector('.time-btn[data-range="max"]');
  if (btnMax) {
    btnMax.title = 'Free CoinGecko API caps MAX to the last 365 days.';
  }
}

// ===== Data Refresh =====
async function refreshDashboard() {
  console.log('🔄 Refreshing dashboard data...');
  
  // Nur Network/History refreshen, Price Chart nur bei manuellem Toggle
  const [networkData, historyData, taoPrice] = await Promise.all([
    fetchNetworkData(),
    fetchHistoryData(),
    fetchTaoPrice()
  ]);
  
  updateNetworkStats(networkData);
  updateTaoPrice(taoPrice);
  
  if (historyData && (!validatorsChart || historyData.length > 0)) {
    createValidatorsChart(historyData);
  }
  
  console.log('✅ Dashboard updated');
}

// ===== Reorder charts: price left, validators right (also first on mobile) =====
function reorderCharts() {
  const priceCard = document.getElementById('priceChart')?.closest('.dashboard-card');
  const validatorsCard = document.getElementById('validatorsChart')?.closest('.dashboard-card');

  if (!priceCard || !validatorsCard) return;
  const row = priceCard.parentElement;
  if (!row || row !== validatorsCard.parentElement) return;

  // If priceCard is not already before validatorsCard, move it
  if (priceCard.nextElementSibling !== validatorsCard) {
    row.insertBefore(priceCard, validatorsCard);
  }
}

// ===== Initialization =====
async function initDashboard() {
  // ensure correct order before rendering
  reorderCharts();

  console.log('🚀 Initializing Bittensor-Labs Dashboard...');

  setupMaxTooltip();
  setupTimeRangeToggle();

  // Erst Network/History/Price (Spot) laden – robust gegen CoinGecko-Fehler
  const [networkData, historyData, taoPrice] = await Promise.all([
    fetchNetworkData(),
    fetchHistoryData(),
    fetchTaoPrice()
  ]);

  updateNetworkStats(networkData);
  updateTaoPrice(taoPrice);
  if (historyData) createValidatorsChart(historyData);

  // Danach Price-History separat, Spinner immer räumen
  const priceCard = document.querySelector('#priceChart')?.closest('.dashboard-card');
  const priceHistory = await fetchPriceHistory(currentPriceRange);
  if (priceHistory) {
    createPriceChart(priceHistory, currentPriceRange);
  } else {
    priceCard?.classList.remove('loading');
  }

  setInterval(refreshDashboard, REFRESH_INTERVAL);
  console.log(`⏱️  Auto-refresh: every ${REFRESH_INTERVAL / 1000}s`);
}

// ===== Start on DOM Ready =====
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}

// Einmalige Migration: altes MAX-Caching entfernen
(function migratePriceCacheKeys() {
  try { localStorage.removeItem('tao_price_max'); } catch {}
})();