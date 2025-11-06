// ===== API Configuration =====
const API_BASE = '/api';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const REFRESH_INTERVAL = 60000;
const PRICE_CACHE_TTL = 300000;
const PRICE_CACHE_TTL_MAX = 3600000;

// ===== State Management =====
let priceChart = null;           // removed: validatorsChart
let lastPrice = null;
let currentPriceRange = '7';
let isLoadingPrice = false;

// State
let halvingDate = null;
let halvingInterval = null;

// ===== Utility Functions =====
function animateValue(element, start, end, duration = 1000) {
  const startTime = performance.now();
  const isFloat = end % 1 !== 0;
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function (ease-out-cubic)
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    
    const current = start + (end - start) * easeProgress;
    
    if (isFloat) {
      element.textContent = formatNumber(current);
    } else {
      element.textContent = formatFull(Math.round(current));
    }
    
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = isFloat ? formatNumber(end) : formatFull(end);
    }
  }
  
  requestAnimationFrame(update);
}

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

async function fetchTaoPrice() {
  try {
    const res = await fetch(`${COINGECKO_API}/coins/bittensor?localization=false&tickers=false&community_data=false&developer_data=false`);
    const data = await res.json();
    
    return {
      price: data.market_data?.current_price?.usd,
      change24h: data.market_data?.price_change_percentage_24h,
      circulatingSupply: data.market_data?.circulating_supply
    };
  } catch (err) {
    return { price: null, change24h: null, circulatingSupply: null };
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
  const elements = {
    blockHeight: document.getElementById('blockHeight'),
    maxSupply: document.getElementById('maxSupply'),
    subnets: document.getElementById('subnets'),
    emission: document.getElementById('emission'),
    totalNeurons: document.getElementById('totalNeurons'),
    validators: document.getElementById('validators')
  };

  // Animate numbers instead of instant update
  if (data.block_height !== undefined) {
    const currentValue = parseInt(elements.blockHeight.textContent.replace(/,/g, '')) || 0;
    animateValue(elements.blockHeight, currentValue, data.block_height, 800);
  }
  
  if (data.max_supply !== undefined) {
    const currentValue = parseInt(elements.maxSupply.textContent.replace(/[^0-9]/g, '')) || 0;
    animateValue(elements.maxSupply, currentValue, data.max_supply, 1000);
  }
  
  if (data.total_subnets !== undefined) {
    const currentValue = parseInt(elements.subnets.textContent.replace(/,/g, '')) || 0;
    animateValue(elements.subnets, currentValue, data.total_subnets, 600);
  }
  
  if (data.emission_rate !== undefined) {
    const currentValue = parseInt(elements.emission.textContent.replace(/[^0-9]/g, '')) || 0;
    animateValue(elements.emission, currentValue, data.emission_rate, 800);
  }
  
  if (data.total_neurons !== undefined) {
    const currentValue = parseInt(elements.totalNeurons.textContent.replace(/,/g, '')) || 0;
    animateValue(elements.totalNeurons, currentValue, data.total_neurons, 1000);
  }
  
  if (data.active_validators !== undefined) {
    const currentValue = parseInt(elements.validators.textContent.replace(/,/g, '')) || 0;
    animateValue(elements.validators, currentValue, data.active_validators, 800);
  }
}

function updateTaoPrice(priceData) {
  const priceEl = document.getElementById('taoPrice');
  const changeEl = document.getElementById('priceChange');
  const pillEl = document.getElementById('taoPricePill');
  
  if (!priceEl) return;
  
  if (priceData.price) {
    priceEl.textContent = formatPrice(priceData.price);
    priceEl.classList.remove('skeleton-text');
    
    // Update 24h change indicator
    if (priceData.change24h !== null && priceData.change24h !== undefined && changeEl) {
      const change = priceData.change24h;
      const isPositive = change >= 0;
      
      changeEl.textContent = `${Math.abs(change).toFixed(2)}%`;
      changeEl.className = `price-change ${isPositive ? 'positive' : 'negative'}`;
      changeEl.style.display = 'flex';
    }
    
    animatePriceChange(pillEl, priceData.price);
  } else {
    priceEl.textContent = 'N/A';
    priceEl.classList.remove('skeleton-text');
    if (changeEl) changeEl.style.display = 'none';
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

// removed: createValidatorsChart (no validator chart)

// Price chart stays unchanged
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

// ===== Time Range Toggle =====
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
  
  // Only network + spot price
  const [networkData, taoPrice] = await Promise.all([
    fetchNetworkData(),
    fetchTaoPrice()
  ]);
  
  updateNetworkStats(networkData);
  updateTaoPrice(taoPrice);

  console.log('✅ Dashboard updated');
}

// ===== Initialization =====
async function initDashboard() {
  console.log('🚀 Initializing Bittensor-Labs Dashboard...');

  setupMaxTooltip();
  setupTimeRangeToggle();

  // Initial load without validators/history
  const [networkData, taoPrice] = await Promise.all([
    fetchNetworkData(),
    fetchTaoPrice()
  ]);

  updateNetworkStats(networkData);
  updateTaoPrice(taoPrice);

  // Load price history
  const priceCard = document.querySelector('#priceChart')?.closest('.dashboard-card');
  const priceHistory = await fetchPriceHistory(currentPriceRange);
  if (priceHistory) {
    createPriceChart(priceHistory, currentPriceRange);
  } else {
    console.warn('⚠️  No price history received');
  }
  
  // Start halving countdown if applicable
  startHalvingCountdown();
  
  console.log('✅ Dashboard initialized');
}

// ===== Halving Countdown =====
function calculateHalvingDate(circulatingSupply, emissionRate) {
  const HALVING_SUPPLY = 10_500_000;
  const remaining = HALVING_SUPPLY - circulatingSupply;
  if (remaining <= 0) return null;
  
  const daysLeft = remaining / emissionRate;
  return new Date(Date.now() + daysLeft * 24 * 60 * 60 * 1000);
}

function updateHalvingCountdown() {
  if (!halvingDate) return;
  const distance = halvingDate - Date.now();
  
  const days = Math.floor(distance / (1000 * 60 * 60 * 24));
  const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  document.getElementById('halvingCountdown').textContent = 
    `Halving in ${days}d ${hours}h`;
}

function startHalvingCountdown() {
  // Stop any existing countdown
  if (halvingInterval) {
    clearInterval(halvingInterval);
    halvingInterval = null;
  }
  
  // Calculate next halving date
  const emissionRate = parseFloat(document.getElementById('emission').textContent.replace(/[^0-9.]/g, ''));
  const circulatingSupply = parseFloat(document.getElementById('maxSupply').textContent.replace(/[^0-9.]/g, ''));
  halvingDate = calculateHalvingDate(circulatingSupply, emissionRate);
  
  // Immediate update
  updateHalvingCountdown();
  
  // Update every hour
  halvingInterval = setInterval(updateHalvingCountdown, 60 * 60 * 1000);
}

// Start dashboard initialization
initDashboard();

// Global refresh interval (z.B. für Preisupdates)
setInterval(refreshDashboard, REFRESH_INTERVAL);