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
window.halvingDate = null;
window.halvingInterval = null;
window.circulatingSupply = null;

// ===== Utility Functions =====
function animateValue(element, start, end, duration = 1000) {
  const startTime = performance.now();
  const isFloat = end % 1 !== 0;
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
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

async function fetchTaostats() {
  try {
    const res = await fetch(`${API_BASE}/taostats`);
    if (!res.ok) throw new Error(`Taostats API error: ${res.status}`);
    const data = await res.json();
    if (!data || !data.circulating_supply || !data.price) throw new Error('No valid Taostats data');
    return data;
  } catch (err) {
    console.warn('⚠️ Taostats fetch failed:', err);
    return null;
  }
}

async function fetchTaoPrice() {
  // 1. Versuche Taostats
  const taostats = await fetchTaostats();
  if (taostats && taostats.price) {
    return {
      price: taostats.price,
      change24h: taostats.percent_change_24h ?? null,
      _source: 'taostats'
    };
  }
  // 2. Fallback: CoinGecko
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bittensor&vs_currencies=usd&include_24hr_change=true';
  try {
    const res = await fetch(url);
    const data = await res.json();
    return {
      price: data.bittensor?.usd ?? null,
      change24h: data.bittensor?.usd_24h_change ?? null,
      _source: 'coingecko'
    };
  } catch (err) {
    return { price: null, change24h: null, _source: 'error' };
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

async function fetchCirculatingSupply() {
  // 1. Versuche Taostats
  const taostats = await fetchTaostats();
  if (taostats && taostats.circulating_supply) {
    window._circSupplySource = taostats._source || 'taostats';
    return taostats.circulating_supply;
  }
  // 2. Fallback: CoinGecko
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/coins/bittensor');
    const data = await res.json();
    window._circSupplySource = 'coingecko';
    return data.market_data?.circulating_supply ?? null;
  } catch (err) {
    window._circSupplySource = 'fallback';
    return null;
  }
}

// ===== UI Updates =====
function updateTaoPrice(priceData) {
  const priceEl = document.getElementById('taoPrice');
  const changeEl = document.getElementById('priceChange');
  if (!priceEl) return;
  if (priceData.price) {
    priceEl.textContent = `$${priceData.price.toFixed(2)}`;
    priceEl.classList.remove('skeleton-text');
    if (changeEl && priceData.change24h !== undefined && priceData.change24h !== null) {
      const change = priceData.change24h;
      changeEl.textContent = `${change > 0 ? '↑' : '↓'}${change.toFixed(2)}% (24h)`;
      changeEl.style.display = 'inline';
      changeEl.className = `price-change ${change >= 0 ? 'positive' : 'negative'}`;
    }
  } else {
    priceEl.textContent = 'N/A';
    if (changeEl) changeEl.style.display = 'none';
  }
  lastPrice = priceData.price;
  tryUpdateMarketCapAndFDV();
}

function updateMarketCapAndFDV(price, circulatingSupply) {
  const marketCapEl = document.getElementById('marketCap');
  const fdvEl = document.getElementById('fdv');
  const maxSupply = 21_000_000;
  if (marketCapEl && price && circulatingSupply) {
    const marketCap = price * circulatingSupply;
    marketCapEl.textContent = `$${marketCap.toLocaleString('en-US', {maximumFractionDigits: 0})}`;
  }
  if (fdvEl && price) {
    const fdv = price * maxSupply;
    fdvEl.textContent = `$${fdv.toLocaleString('en-US', {maximumFractionDigits: 0})}`;
  }
}

function tryUpdateMarketCapAndFDV() {
  if (window.circulatingSupply && lastPrice) {
    updateMarketCapAndFDV(lastPrice, window.circulatingSupply);
  }
}

async function updateNetworkStats(data) {
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
    elements.blockHeight.textContent = formatFull(data.blockHeight);
  }
  if (data.subnets !== undefined) {
    elements.subnets.textContent = formatFull(data.subnets);
  }
  if (data.validators !== undefined) {
    elements.validators.textContent = formatFull(data.validators);
  }
  if (data.emission !== undefined) {
    elements.emission.textContent = formatFull(data.emission);
  }
  if (data.totalNeurons !== undefined) {
    elements.totalNeurons.textContent = formatFull(data.totalNeurons);
  }

  // Circulating Supply bevorzugt von Taostats
  const circSupply = await fetchCirculatingSupply();
  const supplyEl = document.getElementById('circulatingSupply');
  if (supplyEl && circSupply) {
    const current = (circSupply / 1_000_000).toFixed(2);
    supplyEl.textContent = `${current}M / 21M τ`;
    supplyEl.title = `Source: ${window._circSupplySource || 'unknown'}`;
    window.circulatingSupply = circSupply;
  } else {
    // Fallback: dynamisch berechnen
    const emissionPerBlock = 1;
    let fallbackSupply = typeof data.blockHeight === 'number' && data.blockHeight > 0
      ? data.blockHeight * emissionPerBlock
      : null;
    if (supplyEl && fallbackSupply) {
      const current = (fallbackSupply / 1_000_000).toFixed(2);
      supplyEl.textContent = `${current}M / 21M τ`;
      supplyEl.title = 'Source: fallback';
      window.circulatingSupply = fallbackSupply;
    }
  }
  tryUpdateMarketCapAndFDV();

  // Halving-Berechnung
  const HALVING_SUPPLY = 10_500_000;
  const emissionPerDay = typeof data.emission === 'string'
    ? parseInt(data.emission.replace(/,/g, ''))
    : data.emission;
  const daysToHalving = window.circulatingSupply && emissionPerDay
    ? (HALVING_SUPPLY - window.circulatingSupply) / emissionPerDay
    : null;
  window.halvingDate = daysToHalving && daysToHalving > 0
    ? new Date(Date.now() + daysToHalving * 24 * 60 * 60 * 1000)
    : null;

  startHalvingCountdown();
}

// Price chart stays unchanged
function createPriceChart(priceHistory, range = '7') {
  const canvas = document.getElementById('priceChart');
  if (!canvas || !priceHistory || !Array.isArray(priceHistory) || priceHistory.length === 0) {
    console.warn('⚠️  Cannot create price chart: invalid data');
    return;
  }
  const ctx = canvas.getContext('2d');
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
      if (isLoadingPrice) {
        console.log('⏳ Already loading, please wait...');
        return;
      }
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const raw = e.currentTarget?.dataset?.range;
      const norm = normalizeRange(raw);
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

// ===== Dynamic Tooltip System =====
function setupDynamicTooltips() {
  // Tooltip-Element einmalig anlegen
  let tooltip = document.createElement('div');
  tooltip.className = 'dynamic-tooltip';
  document.body.appendChild(tooltip);

  function showTooltip(e, text) {
    tooltip.textContent = text;
    tooltip.classList.add('visible');
    // Position berechnen
    const rect = e.target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    let top = rect.bottom + 8;
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;

    // Am rechten Rand anpassen
    if (left + tooltipRect.width > window.innerWidth - 8) {
      left = window.innerWidth - tooltipRect.width - 8;
    }
    // Am linken Rand anpassen
    if (left < 8) left = 8;

    // Wenn unten zu wenig Platz, nach oben anzeigen
    if (top + tooltipRect.height > window.innerHeight - 8) {
      top = rect.top - tooltipRect.height - 8;
    }
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  function hideTooltip() {
    tooltip.classList.remove('visible');
  }

  document.querySelectorAll('.info-badge').forEach(badge => {
    const text = badge.getAttribute('data-tooltip');
    // Desktop: Hover
    badge.addEventListener('mouseenter', e => showTooltip(e, text));
    badge.addEventListener('mouseleave', hideTooltip);
    badge.addEventListener('focus', e => showTooltip(e, text));
    badge.addEventListener('blur', hideTooltip);
    // Mobile: Touch/Klick
    badge.addEventListener('click', e => {
      e.stopPropagation();
      showTooltip(e, text);
      setTimeout(hideTooltip, 2500);
    });
  });

  // Tooltip schließen, wenn außerhalb geklickt wird (mobile)
  document.addEventListener('click', hideTooltip);
}
setupDynamicTooltips();

// ===== Data Refresh =====
async function refreshDashboard() {
  console.log('🔄 Refreshing dashboard data...');
  const [networkData, taoPrice] = await Promise.all([
    fetchNetworkData(),
    fetchTaoPrice()
  ]);
  updateNetworkStats(networkData);
  updateTaoPrice(taoPrice);
  console.log('✅ Dashboard updated');
}

// ===== Auto-Refresh mit Countdown-Circle =====
const REFRESH_SECONDS = 60; // alle 60 Sekunden
let refreshCountdown = REFRESH_SECONDS;
let refreshTimer = null;

function renderRefreshIndicator() {
  const el = document.getElementById('refresh-indicator');
  if (!el) return;
  // SVG Circle (animiert)
  const radius = 12;
  const stroke = 3;
  const circ = 2 * Math.PI * radius;
  const progress = (refreshCountdown / REFRESH_SECONDS);
  el.innerHTML = `
    <svg viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="${radius}" stroke="#222" stroke-width="${stroke}" fill="none"/>
      <circle cx="14" cy="14" r="${radius}" stroke="#22c55e" stroke-width="${stroke}" fill="none"
        stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - progress)}"
        style="transition: stroke-dashoffset 0.5s;"/>
    </svg>
    <span class="refresh-label">${refreshCountdown}</span>
  `;
  el.title = `Auto-refresh in ${refreshCountdown}s`;
}

function startAutoRefresh() {
  renderRefreshIndicator();
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    refreshCountdown--;
    if (refreshCountdown <= 0) {
      refreshCountdown = REFRESH_SECONDS;
      refreshDashboard();
    }
    renderRefreshIndicator();
  }, 1000);
  // Klick auf den Circle = sofort refreshen
  const el = document.getElementById('refresh-indicator');
  if (el) {
    el.onclick = () => {
      refreshCountdown = REFRESH_SECONDS;
      refreshDashboard();
      renderRefreshIndicator();
    };
  }
}

// ===== Initialization =====
async function initDashboard() {
  console.log('🚀 Initializing Bittensor-Labs Dashboard...');
  setupMaxTooltip();
  setupTimeRangeToggle();
  const [networkData, taoPrice] = await Promise.all([
    fetchNetworkData(),
    fetchTaoPrice()
  ]);
  await updateNetworkStats(networkData);
  updateTaoPrice(taoPrice);
  const priceCard = document.querySelector('#priceChart')?.closest('.dashboard-card');
  const priceHistory = await fetchPriceHistory(currentPriceRange);
  if (priceHistory) {
    createPriceChart(priceHistory, currentPriceRange);
  }
  startHalvingCountdown();
  startAutoRefresh(); // <--- NEU: Auto-Refresh starten
}

// ===== Halving Countdown =====
function calculateHalvingDate(circulatingSupply, emissionRate) {
  const HALVING_SUPPLY = 10_500_000;
  const remaining = HALVING_SUPPLY - circulatingSupply;
  if (remaining <= 0) return null;
  const daysLeft = remaining / emissionRate;
  const msLeft = daysLeft * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + msLeft);
}

function updateHalvingCountdown() {
  const countdownEl = document.getElementById('halvingCountdown');
  if (!countdownEl || !window.halvingDate) return;
  const now = Date.now();
  const distance = window.halvingDate.getTime() - now;
  if (distance < 0) {
    countdownEl.textContent = 'Halving Live! 🎉';
    if (window.halvingInterval) {
      clearInterval(window.halvingInterval);
      window.halvingInterval = null;
    }
    return;
  }
  const days = Math.floor(distance / (1000 * 60 * 60 * 24));
  const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
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
  const countdownEl = document.getElementById('halvingCountdown');
  if (!window.circulatingSupply || !window.halvingDate || !countdownEl) {
    countdownEl.textContent = 'Calculating...';
    return;
  }
  if (window.halvingInterval) {
    clearInterval(window.halvingInterval);
    window.halvingInterval = null;
  }
  updateHalvingCountdown();
  window.halvingInterval = setInterval(updateHalvingCountdown, 1000);
}

// Initialisierung
initDashboard();