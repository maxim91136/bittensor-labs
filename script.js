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

// Compact display for large numbers (e.g. 1.23M, 4.56B)
function formatCompact(num) {
  num = Number(num);
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
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
    return {
      ...data,
      last_updated: data.last_updated || data._timestamp || null,
      _source: 'taostats'
    };
  } catch (err) {
    console.warn('⚠️ Taostats fetch failed:', err);
    return null;
  }
}

async function fetchTaoPrice() {
  const taostats = await fetchTaostats();
  if (taostats && taostats.price) {
    return {
      price: taostats.price,
      change24h: taostats.percent_change_24h ?? null,
      last_updated: taostats.last_updated ?? null,
      volume_24h: taostats.volume_24h ?? null,
      _source: 'taostats'
    };
  }
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bittensor&vs_currencies=usd&include_24hr_change=true';
  try {
    const res = await fetch(url);
    const data = await res.json();
    return {
      price: data.bittensor?.usd ?? null,
      change24h: data.bittensor?.usd_24h_change ?? null,
      last_updated: null,
      _source: 'coingecko'
    };
  } catch (err) {
    return { price: null, change24h: null, last_updated: null, _source: 'error' };
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
  const taostats = await fetchTaostats();
  if (taostats && taostats.circulating_supply) {
    window._circSupplySource = taostats._source || 'taostats';
    return taostats.circulating_supply;
  }
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
  const fdv = price * maxSupply;
  marketCapEl.textContent = `$${formatCompact(marketCap)}`;
  fdvEl.textContent = `$${formatCompact(fdv)}`;
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
      if (elements.blockHeight) {
        elements.blockHeight.textContent = formatFull(data.blockHeight);
        elements.blockHeight.classList.remove('skeleton-text');
      }
    }
    if (data.subnets !== undefined) {
      if (elements.subnets) {
        elements.subnets.textContent = formatFull(data.subnets);
        elements.subnets.classList.remove('skeleton-text');
      }
    }
    if (data.validators !== undefined) {
      if (elements.validators) {
        elements.validators.textContent = formatFull(data.validators);
        elements.validators.classList.remove('skeleton-text');
      }
    }
    if (data.emission !== undefined) {
      if (elements.emission) {
        elements.emission.textContent = formatFull(data.emission);
        elements.emission.classList.remove('skeleton-text');
      }
    }
    if (data.totalNeurons !== undefined) {
      if (elements.totalNeurons) {
        elements.totalNeurons.textContent = formatFull(data.totalNeurons);
        elements.totalNeurons.classList.remove('skeleton-text');
      }
    }

  const circSupply = await fetchCirculatingSupply();
  const supplyEl = document.getElementById('circulatingSupply');
  if (supplyEl && circSupply) {
    const current = (circSupply / 1_000_000).toFixed(2);
    supplyEl.textContent = `${current}M / 21M τ`;
    supplyEl.title = `Source: ${window._circSupplySource || 'unknown'}`;
    window.circulatingSupply = circSupply;
  } else {
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

// ===== Dynamic Tooltip System =====
function setupDynamicTooltips() {
  let tooltip = document.createElement('div');
  tooltip.className = 'dynamic-tooltip';
  document.body.appendChild(tooltip);

  function showTooltip(e, text) {
    tooltip.textContent = text;
    tooltip.classList.add('visible');
    const rect = e.target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    let top = rect.bottom + 8;
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    if (left + tooltipRect.width > window.innerWidth - 8) {
      left = window.innerWidth - tooltipRect.width - 8;
    }
    if (left < 8) left = 8;
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
    badge.addEventListener('mouseenter', e => showTooltip(e, text));
    badge.addEventListener('mouseleave', hideTooltip);
    badge.addEventListener('focus', e => showTooltip(e, text));
    badge.addEventListener('blur', hideTooltip);
    badge.addEventListener('click', e => {
      e.stopPropagation();
      showTooltip(e, text);
      setTimeout(hideTooltip, 2500);
    });
  });

  document.querySelectorAll('.halving-pill[data-tooltip]').forEach(pill => {
    const text = pill.getAttribute('data-tooltip');
    pill.addEventListener('mouseenter', e => showTooltip(e, text));
    pill.addEventListener('mouseleave', hideTooltip);
    pill.addEventListener('focus', e => showTooltip(e, text));
    pill.addEventListener('blur', hideTooltip);
    pill.addEventListener('click', e => {
      e.stopPropagation();
      showTooltip(e, text);
      setTimeout(hideTooltip, 2500);
    });
  });

  document.addEventListener('click', hideTooltip);
}
setupDynamicTooltips();

// ===== Data Refresh =====
async function refreshDashboard() {
  const [networkData, taoPrice, taostats] = await Promise.all([
    fetchNetworkData(),
    fetchTaoPrice(),
    fetchTaostats()
  ]);
  updateNetworkStats(networkData);
  updateTaoPrice(taoPrice);

  // LAST UPDATE from Taostats, otherwise fallback
  const lastUpdateEl = document.getElementById('lastUpdate');
  let lastUpdated = null;
  if (taoPrice && taoPrice._source === 'taostats' && taoPrice.last_updated) {
    lastUpdated = taoPrice.last_updated;
  } else if (taoPrice && taoPrice._source === 'taostats' && taoPrice._timestamp) {
    lastUpdated = taoPrice._timestamp;
  }
  let lastUpdateStr = '--:--';
  if (lastUpdated) {
    const d = new Date(lastUpdated);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    lastUpdateStr = `${hh}:${mm}`;
    if (lastUpdateEl) lastUpdateEl.textContent = `Updated: ${lastUpdateStr}`;
  } else {
    if (lastUpdateEl) lastUpdateEl.textContent = `Updated: --:--`;
  }

  // Get volume from taostats!
  const volumeEl = document.getElementById('volume24h');
  if (volumeEl && taostats && typeof taostats.volume_24h === 'number') {
  volumeEl.textContent = `$${formatCompact(taostats.volume_24h)}`;
  }

  // Set API status
  const apiStatusEl = document.getElementById('apiStatus');
  const apiStatusIcon = document.querySelector('#apiStatusCard .stat-icon');
  let statusText = 'All systems ok';
  let statusIcon = '🟢';
  if (!networkData || !taostats) {
    statusText = 'API error';
    statusIcon = '🔴';
  } else if (!taostats.price || !taostats.volume_24h) {
    statusText = 'Partial data';
    statusIcon = '🟡';
  }
  if (apiStatusEl) apiStatusEl.textContent = statusText;
  if (apiStatusIcon) apiStatusIcon.textContent = statusIcon;
}

// ===== Auto-refresh with countdown circle =====
const REFRESH_SECONDS = 60;
let refreshCountdown = REFRESH_SECONDS;
let refreshTimer = null;

function renderRefreshIndicator() {
  const el = document.getElementById('refresh-indicator');
  if (!el) return;
  const radius = 7;
  const stroke = 2.2;
  const circ = 2 * Math.PI * radius;
  const progress = (refreshCountdown / REFRESH_SECONDS);
  el.innerHTML = `
    <svg viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="8" stroke="#222" stroke-width="2.2" fill="none"/>
      <circle cx="10" cy="10" r="8" stroke="#22c55e" stroke-width="2.2" fill="none"
        stroke-dasharray="${2 * Math.PI * 8}" stroke-dashoffset="${2 * Math.PI * 8 * (1 - progress)}"
        style="transition: stroke-dashoffset 0.5s;"/>
    </svg>
    <span class="refresh-label">${refreshCountdown}</span>
  `;
  el.title = `Auto-refresh in ${refreshCountdown}s`;
  el.style.pointerEvents = "none";
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
  const el = document.getElementById('refresh-indicator');
  if (el) {
    el.onclick = () => {
      refreshCountdown = REFRESH_SECONDS;
      refreshDashboard();
      renderRefreshIndicator();
    };
  }
}

// ===== Initialization of Price Chart =====
function createPriceChart(priceHistory, range) {
  const canvas = document.getElementById('priceChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const labels = priceHistory.map(([timestamp]) => {
    const date = new Date(timestamp);
    return `${date.getMonth()+1}/${date.getDate()}`;
  });
  const data = priceHistory.map(([_, price]) => price);

  // Only destroy if chart object and method exist
  if (window.priceChart && typeof window.priceChart.destroy === 'function') {
    window.priceChart.destroy();
  }

  window.priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'TAO Price',
        data,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.1)',
        tension: 0.2,
        pointRadius: 0,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: true, grid: { display: false } },
        y: { display: true, grid: { color: '#222' } }
      }
    }
  });
}

// ===== Initialization =====
async function initDashboard() {
  const [networkData, taoPrice] = await Promise.all([
    fetchNetworkData(),
    fetchTaoPrice()
  ]);
  await updateNetworkStats(networkData);
  updateTaoPrice(taoPrice);

  // Fill initial volume
  const taostats = await fetchTaostats();
  const volumeEl = document.getElementById('volume24h');
  if (volumeEl && taostats && typeof taostats.volume_24h === 'number') {
    volumeEl.textContent = `$${formatCompact(taostats.volume_24h)}`;
  }

  // Fill initial API status
  const apiStatusEl = document.getElementById('apiStatus');
  const apiStatusIcon = document.querySelector('#apiStatusCard .stat-icon');
  let statusText = 'All systems ok';
  let statusIcon = '🟢';
  if (!networkData || !taostats) {
    statusText = 'API error';
    statusIcon = '🔴';
  } else if (!taostats.price || !taostats.volume_24h) {
    statusText = 'Partial data';
    statusIcon = '🟡';
  }
  if (apiStatusEl) apiStatusEl.textContent = statusText;
  if (apiStatusIcon) apiStatusIcon.textContent = statusIcon;

  const priceCard = document.querySelector('#priceChart')?.closest('.dashboard-card');
  const priceHistory = await fetchPriceHistory(currentPriceRange);
  if (priceHistory) {
    createPriceChart(priceHistory, currentPriceRange);
  }
  startHalvingCountdown();
  startAutoRefresh();
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

// Initialization
initDashboard();

// Prevent link click on info badge (pro solution)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.stat-card .info-badge').forEach(badge => {
    badge.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
    });
    badge.addEventListener('touchstart', function(e) {
      e.stopPropagation();
    });
  });

  // Time range buttons for the chart
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
  const range = btn.getAttribute('data-range'); // "7", "30", "365"
  if (range === currentPriceRange) return; // No reload if same
      currentPriceRange = range;

  // Update button UI
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

  // Show chart skeleton (optional)
      const priceCard = btn.closest('.dashboard-card');
      if (priceCard) priceCard.classList.add('loading');

  // Load data and redraw chart
      const priceHistory = await fetchPriceHistory(currentPriceRange);
      if (priceHistory) {
        createPriceChart(priceHistory, currentPriceRange);
      }

  // Hide skeleton
      if (priceCard) priceCard.classList.remove('loading');
    });
  });

  // Info badge tooltip for API status card: static text
  const infoBadge = document.querySelector('#apiStatusCard .info-badge');
  if (infoBadge) {
    infoBadge.setAttribute(
      'data-tooltip',
      'Status of all data sources powering the dashboard\nTaostats: OK\nCoinGecko: OK\nBittensor SDK: OK'
    );
  }
});