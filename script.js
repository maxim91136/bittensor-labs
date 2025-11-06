// ===== API Configuration =====
const API_BASE = '/api';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const REFRESH_INTERVAL = 60000;
const PRICE_CACHE_TTL = 300000;
const PRICE_CACHE_TTL_MAX = 3600000;

// ===== State Management =====
let priceChart = null;
let lastPrice = null;
let currentPriceRange = '7';
let isLoadingPrice = false;

// Halving State
let halvingDate = null;
let halvingInterval = null;
let circulatingSupply = null; // ✅ State für Circ Supply

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
    const res = await fetch(`${API_BASE}/network`);
    if (!res.ok) throw new Error(`Network API error: ${res.status}`);
    const data = await res.json();
    
    console.log('🔍 Backend data keys:', Object.keys(data)); // DEBUG
    
    return data;
  } catch (err) {
    console.error('❌ fetchNetworkData:', err);
    return null;
  }
}

// ===== Data Fetching =====
async function fetchTaoPrice() {
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bittensor&vs_currencies=usd&include_24hr_change=true';
  try {
    const res = await fetch(url);
    const data = await res.json();
    return {
      price: data.bittensor?.usd ?? null,
      change24h: data.bittensor?.usd_24h_change ?? null
    };
  } catch (err) {
    return { price: null, change24h: null };
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
function updateTaoPrice(priceData) {
  const priceEl = document.getElementById('taoPrice');
  if (!priceEl) return;
  if (priceData.price) {
    priceEl.textContent = `$${priceData.price.toFixed(2)}`;
    priceEl.classList.remove('skeleton-text');
  } else {
    priceEl.textContent = 'N/A';
  }
}

function updateNetworkStats(data) {
  const elements = {
    blockHeight: document.getElementById('blockHeight'),
    subnets: document.getElementById('subnets'),
    emission: document.getElementById('emission'),
    totalNeurons: document.getElementById('totalNeurons'),
    validators: document.getElementById('validators'),
    circulatingSupply: document.getElementById('circulatingSupply'),
    progress: document.querySelector('.stat-progress')
  };

  if (data.blockHeight !== undefined) {
    const currentValue = parseInt(elements.blockHeight.textContent.replace(/,/g, '')) || 0;
    animateValue(elements.blockHeight, currentValue, data.blockHeight, 800);
  }
  
  if (data.subnets !== undefined) {
    const currentValue = parseInt(elements.subnets.textContent.replace(/,/g, '')) || 0;
    animateValue(elements.subnets, currentValue, data.subnets, 600);
  }
  
  if (data.emission !== undefined) {
    const rate = typeof data.emission === 'string' 
      ? parseInt(data.emission.replace(/,/g, '')) 
      : data.emission;
    const currentValue = parseInt(elements.emission.textContent.replace(/[^0-9]/g, '')) || 0;
    animateValue(elements.emission, currentValue, rate, 800);
  }
  
  if (data.totalNeurons !== undefined) {
    const currentValue = parseInt(elements.totalNeurons.textContent.replace(/,/g, '')) || 0;
    animateValue(elements.totalNeurons, currentValue, data.totalNeurons, 1000);
  }
  
  if (data.validators !== undefined) {
    const currentValue = parseInt(elements.validators.textContent.replace(/,/g, '')) || 0;
    animateValue(elements.validators, currentValue, data.validators, 800);
  }
  
  // Dynamische Circulating Supply & Halving
  if (data.blockHeight && data.emission) {
    const emissionPerDay = typeof data.emission === 'string'
      ? parseInt(data.emission.replace(/,/g, ''))
      : data.emission;

    const { halvingDate, circulatingSupply } = calculateHalvingDateDynamic(data.blockHeight, emissionPerDay);

    // Circulating Supply Card
    if (elements.circulatingSupply) {
      const current = (circulatingSupply / 1_000_000).toFixed(2);
      elements.circulatingSupply.textContent = `${current}M / 21M τ`;
    }
    if (elements.progress) {
      const percent = ((circulatingSupply / 21_000_000) * 100).toFixed(1);
      elements.progress.textContent = `${percent}%`;
    }

    // Halving Countdown
    window.circulatingSupply = circulatingSupply; // global für Countdown
    window.halvingDate = halvingDate;
    startHalvingCountdown();
  }
}

// ✅ ENTFERNT: createValidatorsChart (no validator chart)

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

function setPriceRangeNote(range) {
  const noteEl = document.getElementById('priceRangeNote');
  if (!noteEl) return;
  if (range === '7') noteEl.textContent = 'Showing last 7 days';
  else if (range === '30') noteEl.textContent = 'Showing last 30 days';
  else if (range === '365') noteEl.textContent = 'Showing last 365 days';
  else noteEl.textContent = '';
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
  }
  
  // Start halving countdown if applicable
  startHalvingCountdown();
}

// ===== Halving Countdown =====
function calculateHalvingDate(circulatingSupply, emissionRate) {
  const HALVING_SUPPLY = 10_500_000; // 50% of 21M
  const remaining = HALVING_SUPPLY - circulatingSupply;
  
  if (remaining <= 0) return null;
  
  const daysLeft = remaining / emissionRate;
  const msLeft = daysLeft * 24 * 60 * 60 * 1000;
  
  return new Date(Date.now() + msLeft);
}

function updateHalvingCountdown() {
  const countdownEl = document.getElementById('halvingCountdown');
  if (!countdownEl || !halvingDate) return;
  
  const now = Date.now();
  const distance = halvingDate.getTime() - now;
  
  if (distance < 0) {
    countdownEl.textContent = 'Halving Live! 🎉';
    if (halvingInterval) {
      clearInterval(halvingInterval);
      halvingInterval = null;
    }
    return;
  }
  
  const days = Math.floor(distance / (1000 * 60 * 60 * 24));
  const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
  
  // Compact format
  if (days > 0) {
    countdownEl.textContent = `Halving in ${days}d ${hours}h`;
  } else if (hours > 0) {
    countdownEl.textContent = `Halving in ${hours}h ${minutes}m`;
  } else {
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);
    countdownEl.textContent = `${minutes}m ${seconds}s`;
  }
}

function startHalvingCountdown() {
  if (halvingInterval) {
    clearInterval(halvingInterval);
    halvingInterval = null;
  }
  
  if (!circulatingSupply) {
    console.warn('⚠️ No circulating supply available for halving countdown');
    return;
  }
  
  // Get emission rate from DOM (already formatted by backend)
  const emissionEl = document.getElementById('emission');
  const emissionRate = emissionEl 
    ? parseFloat(emissionEl.textContent.replace(/[^0-9]/g, '')) 
    : 7200;
  
  halvingDate = calculateHalvingDate(circulatingSupply, emissionRate);
  
  if (!halvingDate) {
    const countdownEl = document.getElementById('halvingCountdown');
    countdownEl.textContent = 'Halving Info N/A';
    return;
  }
  
  updateHalvingCountdown();
  
  halvingInterval = setInterval(updateHalvingCountdown, 1000);
}

// Initialisierung
initDashboard();

// ===== Polling =====
// setInterval(refreshDashboard, REFRESH_INTERVAL);

// Neue dynamische Halving-Berechnung
function calculateHalvingDateDynamic(blockHeight, emissionPerDay) {
  // Fallback: Nutze die Standard-Halving-Berechnung
  const HALVING_SUPPLY = 10_500_000;
  const emissionPerBlock = 1;
  const circulatingSupply = blockHeight * emissionPerBlock;
  const remaining = HALVING_SUPPLY - circulatingSupply;
  if (remaining <= 0) return { halvingDate: null, circulatingSupply };
  const daysLeft = remaining / emissionPerDay;
  const msLeft = daysLeft * 24 * 60 * 60 * 1000;
  return {
    halvingDate: new Date(Date.now() + msLeft),
    circulatingSupply
  };
}