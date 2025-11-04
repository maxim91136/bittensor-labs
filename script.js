// API Endpoints
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const TAOSTATS_PROXY = '/api/taostats';

// Cache Config
const CACHE_TTL = 60000; // 60s
const CACHE_KEYS = {
  networkStats: 'btlabs_network_stats',
  networkStatsTs: 'btlabs_network_stats_ts',
  taoPrice: 'btlabs_tao_price',
  taoPriceTs: 'btlabs_tao_price_ts',
};

// Cache Helper
function getCached(key, timestampKey, ttl = CACHE_TTL) {
  try {
    const data = localStorage.getItem(key);
    const timestamp = localStorage.getItem(timestampKey);
    
    if (!data || !timestamp) return null;
    
    const age = Date.now() - parseInt(timestamp);
    if (age > ttl) return null;
    
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function setCache(key, timestampKey, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(timestampKey, String(Date.now()));
  } catch (e) {
    console.warn('Cache write failed:', e);
  }
}

// Taostats via Worker
async function fetchTaostatsData(endpoint = 'network/stats') {
  try {
    const response = await fetch(`${TAOSTATS_PROXY}?endpoint=${encodeURIComponent(endpoint)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Worker responded with ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }

    return data;
  } catch (error) {
    console.error(`Taostats fetch failed (${endpoint}):`, error);
    throw error;
  }
}

// Network Stats
async function fetchNetworkStats() {
  const cached = getCached(CACHE_KEYS.networkStats, CACHE_KEYS.networkStatsTs);
  if (cached) {
    console.log('📦 Using cached network stats');
    return cached;
  }

  try {
    const data = await fetchTaostatsData('network/stats');
    
    const stats = {
      blockHeight: data.block_height || data.blockHeight || data.height || null,
      validators: data.validators || data.active_validators || data.validator_count || null,
      subnets: data.subnets || data.total_subnets || data.subnet_count || null,
      emission: data.emission_rate || '7,200',
    };

    setCache(CACHE_KEYS.networkStats, CACHE_KEYS.networkStatsTs, stats);
    
    return stats;
  } catch (error) {
    console.warn('⚠️ Taostats failed, using fallback');
    
    return {
      blockHeight: null,
      validators: 500,
      subnets: 142,
      emission: '7,200',
    };
  }
}

// TAO Price (CoinGecko)
async function fetchTaoPrice() {
  const cached = getCached(CACHE_KEYS.taoPrice, CACHE_KEYS.taoPriceTs);
  if (cached) {
    console.log('📦 Using cached TAO price');
    return cached;
  }

  try {
    const response = await fetch(
      `${COINGECKO_API}/simple/price?ids=bittensor&vs_currencies=usd&include_24hr_change=true`
    );
    
    if (!response.ok) throw new Error('CoinGecko API failed');
    
    const data = await response.json();
    const price = data.bittensor?.usd || null;
    const change = data.bittensor?.usd_24h_change || 0;

    const result = { price, change };
    setCache(CACHE_KEYS.taoPrice, CACHE_KEYS.taoPriceTs, result);
    
    return result;
  } catch (error) {
    console.error('CoinGecko fetch failed:', error);
    return { price: null, change: 0 };
  }
}

// UI Updates
function updateNetworkStats(stats) {
  const elements = {
    blockHeight: document.getElementById('blockHeight'),
    validators: document.getElementById('validators'),
    subnets: document.getElementById('subnets'),
    emission: document.getElementById('emission'),
  };

  if (elements.blockHeight) {
    elements.blockHeight.textContent = stats.blockHeight 
      ? stats.blockHeight.toLocaleString('de-DE')
      : 'N/A';
  }

  if (elements.validators) {
    elements.validators.textContent = stats.validators 
      ? stats.validators.toLocaleString('de-DE')
      : 'N/A';
  }

  if (elements.subnets) {
    elements.subnets.textContent = stats.subnets 
      ? stats.subnets.toLocaleString('de-DE')
      : 'N/A';
  }

  if (elements.emission) {
    elements.emission.textContent = `${stats.emission} τ/day`;
  }
}

function updateTaoPrice(priceData) {
  const priceEl = document.getElementById('taoPrice');
  
  if (!priceEl) return;

  if (priceData.price) {
    const formatted = `$${priceData.price.toFixed(2)}`;
    priceEl.textContent = formatted;
    priceEl.classList.remove('skeleton-text');
  } else {
    priceEl.textContent = 'N/A';
  }
}

// Charts (Mock-Daten)
function initCharts() {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded');
    return;
  }

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(14, 20, 25, 0.95)',
        borderColor: '#2a3544',
        borderWidth: 1,
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
        padding: 10,
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(42, 53, 68, 0.3)', drawBorder: false },
        ticks: { color: '#94a3b8', font: { size: 11 } }
      },
      y: {
        grid: { color: 'rgba(42, 53, 68, 0.3)', drawBorder: false },
        ticks: { color: '#94a3b8', font: { size: 11 } }
      }
    }
  };

  // Validators Chart
  const validatorsCtx = document.getElementById('validatorsChart');
  if (validatorsCtx) {
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const validatorData = Array.from({ length: 24 }, () => Math.floor(Math.random() * 50) + 480);

    new Chart(validatorsCtx, {
      type: 'line',
      data: {
        labels: hours,
        datasets: [{
          data: validatorData,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true,
        }]
      },
      options: commonOptions
    });

    document.querySelector('#validatorsChart').closest('.dashboard-card')?.classList.remove('loading');
  }

  // Price Chart
  const priceCtx = document.getElementById('priceChart');
  if (priceCtx) {
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const priceData = Array.from({ length: 24 }, () => Math.random() * 30 + 460);

    new Chart(priceCtx, {
      type: 'line',
      data: {
        labels: hours,
        datasets: [{
          data: priceData,
          borderColor: '#fb923c',
          backgroundColor: 'rgba(251, 146, 60, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true,
        }]
      },
      options: commonOptions
    });

    document.querySelector('#priceChart').closest('.dashboard-card')?.classList.remove('loading');
  }
}

// Init
async function init() {
  console.log('🚀 Bittensor-Labs initializing...');

  const [networkStats, priceData] = await Promise.all([
    fetchNetworkStats(),
    fetchTaoPrice(),
  ]);

  updateNetworkStats(networkStats);
  updateTaoPrice(priceData);

  if (typeof Chart !== 'undefined') {
    initCharts();
  } else {
    window.addEventListener('load', initCharts);
  }

  console.log('✅ Dashboard ready');
}

// Auto-refresh
setInterval(async () => {
  const [networkStats, priceData] = await Promise.all([
    fetchNetworkStats(),
    fetchTaoPrice(),
  ]);
  updateNetworkStats(networkStats);
  updateTaoPrice(priceData);
}, 60000);

document.addEventListener('DOMContentLoaded', init);