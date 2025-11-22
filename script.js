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
window._prevHalvingTs = null;
// Toggle to enable debugging messages in console: set `window._debug = true` at runtime
window._debug = false;

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

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const num = Number(value);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
}

function readPercentValue(ts, keys) {
  if (!ts) return null;
  for (const k of keys) {
    if (ts[k] !== undefined && ts[k] !== null) return ts[k];
    // allow nested objects (some APIs nest percent_change inside 'market_data' etc.)
    const parts = k.split('.');
    if (parts.length > 1) {
      let v = ts;
      for (const p of parts) { if (v && v[p] !== undefined) { v = v[p]; } else { v = undefined; break; } }
      if (v !== undefined && v !== null) return v;
    }
  }
  return null;
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

  // Price tooltip: show percent changes for available ranges from Taostats (in tooltip only)
  try {
    const pill = document.getElementById('taoPricePill') || document.querySelector('.price-pill');
    if (pill) {
      const ts = window._taostats ?? null;
      const parts = [];
      // Always display lines in a consistent order (1h, 24h, 7d, 30d), using placeholders when missing
      const p1h = readPercentValue(ts, ['percent_change_1h','percent_change_1hr','pct_change_1h','percent_1h_change','percent_change_1Hour','percent_change_1hr']);
      const p24 = readPercentValue(ts, ['percent_change_24h','percent_change_24hr','pct_change_24h','percent_24h_change','percent_change_24hr']) ?? priceData.change24h ?? null;
      const p7d = readPercentValue(ts, ['percent_change_7d','percent_change_7day','pct_change_7d','percent_change_7day']);
      const p30d = readPercentValue(ts, ['percent_change_30d','percent_change_30day','pct_change_30d','percent_change_30day']);
      parts.push(`1h: ${formatPercent(p1h)}`);
      parts.push(`24h: ${formatPercent(p24)}`);
      parts.push(`7d: ${formatPercent(p7d)}`);
      parts.push(`30d: ${formatPercent(p30d)}`);
          if (parts.length) {
            const source = (window._taostats && window._taostats._source) ? window._taostats._source : 'Taostats';
            const lines = ['Price changes:'];
            parts.forEach(p => lines.push(p));
            lines.push(`Source: ${source}`);
            pill.setAttribute('data-tooltip', lines.join('\n'));
      } else {
        pill.removeAttribute('data-tooltip');
      }
    }
  } catch (err) {
    if (window._debug) console.debug('Price tooltip construction failed:', err);
  }

  

  

  
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
  // Keep previous supply snapshot for delta-based emission fallback and crossing detection
  const prevSupplyTs = window._prevSupplyTs ?? null;
  const prevHalvingSupply = (window._prevHalvingSupply !== undefined) ? window._prevHalvingSupply : null;
  const prevHalvingTs = window._prevHalvingTs ?? null;
  const nowTs = Date.now();
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
  // Subtract 1 to exclude Subtensor (subnet 0) from the displayed subnet count
        const displaySubnets = data.subnets > 0 ? data.subnets - 1 : 0;
        elements.subnets.textContent = formatFull(displaySubnets);
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
    // Save the timestamp and previous supply for next update
    window._prevSupplyTs = nowTs;
    // debug: mark that we have circ supply from external source
    if (window._circSupplySource && window._debug) console.debug('circ supply source:', window._circSupplySource);
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
      window._prevSupplyTs = nowTs;
      if (window._debug) console.debug('circ supply fallback to block-derived supply');
    }
  }
  tryUpdateMarketCapAndFDV();

  // Choose the supply value used for Halving calculations:
  // Prefer on-chain `totalIssuanceHuman` returned by /api/network, otherwise fallback to Taostats circulating supply.
  // Halving uses on-chain TotalIssuance when available, otherwise we fall back to circulatingSupply
  const supplyForHalving = (data && data.totalIssuanceHuman !== undefined && data.totalIssuanceHuman !== null)
    ? Number(data.totalIssuanceHuman)
    : (window.circulatingSupply ?? null);
  if (data && data.totalIssuanceHuman !== undefined && data.totalIssuanceHuman !== null) {
    window._halvingSupplySource = 'on-chain';
    if (window._debug) console.debug('Halving: using on-chain totalIssuanceHuman for halving calculation', Number(data.totalIssuanceHuman));
  } else {
    window._halvingSupplySource = (window._circSupplySource || 'taostats');
    if (window._debug) console.debug('Halving: falling back to circulatingSupply for halving calculation');
  }

  // Use generated thresholds to support future halving events (first threshold only)
  const thresholds = generateHalvingThresholds(21_000_000, 6);
  window.halvingThresholds = thresholds;
  const HALVING_SUPPLY = thresholds.length ? thresholds[0] : 10_500_000;
  // parse emission from API (TAO/day) or fallback to supply delta per day
  let emissionPerDay = null;
  if (data && (data.emission !== undefined && data.emission !== null)) {
    emissionPerDay = typeof data.emission === 'string'
      ? parseFloat(data.emission.replace(/,/g, ''))
      : Number(data.emission);
    if (Number.isFinite(emissionPerDay) && emissionPerDay > 0 && window._debug) {
      console.debug('Emission from /api/network used:', emissionPerDay, 'TAO/day');
    }
  }
  // fallback: estimate emission from previous supply snapshot
  // Use previous halving supply snapshot when available so we estimate emission for the same supply basis.
  // Use previous halving snapshot if present for a consistent emission estimate.
  const basePrevSupply = prevHalvingSupply ?? (window._prevCircSupply ?? null);
  const basePrevTs = prevHalvingSupply !== null ? prevHalvingTs : prevSupplyTs;
  if ((!emissionPerDay || !Number.isFinite(emissionPerDay) || emissionPerDay <= 0) && basePrevSupply !== null && basePrevTs) {
    const supplyDelta = Number((supplyForHalving ?? window.circulatingSupply)) - Number(basePrevSupply);
    const msDelta = nowTs - basePrevTs;
    if (msDelta > 0) {
      const daysDelta = msDelta / (24 * 60 * 60 * 1000);
      const estimate = supplyDelta / daysDelta;
      if (Number.isFinite(estimate) && estimate > 0) {
        emissionPerDay = estimate;
        if (window._debug) console.debug('Emission fallback estimate from supply delta:', emissionPerDay, 'TAO/day');
      }
    }
  }
  // If we couldn't infer emission and there was no previous snapshot to compare, log for debugging
  if ((!emissionPerDay || !Number.isFinite(emissionPerDay) || emissionPerDay <= 0) && (!basePrevSupply || !basePrevTs)) {
    if (window._debug) console.debug('Emission estimate unavailable: no /api/network emission and no previous halving snapshot to estimate from');
  }

  // Compute halving date simply by remaining supply / emission per day
  const remaining = (supplyForHalving !== null && supplyForHalving !== undefined) ? (HALVING_SUPPLY - supplyForHalving) : null;
  // halvingThresholds already generated above
  // detect crossing: previous < threshold <= current
  const prevHalvingSupplyForCrossing = (window._prevHalvingSupply !== undefined) ? window._prevHalvingSupply : (window._prevCircSupply ?? null);
  const crossing = prevHalvingSupplyForCrossing !== null && prevHalvingSupplyForCrossing < HALVING_SUPPLY && supplyForHalving >= HALVING_SUPPLY;
  if (crossing) {
    window.halvingJustHappened = { threshold: HALVING_SUPPLY, at: new Date() };
    window.halvingDate = new Date();
    // UI: quick animation on pill, if present
    const pill = document.querySelector('.halving-pill');
    if (pill) {
      pill.classList.add('just-halved');
      setTimeout(() => pill.classList.remove('just-halved'), 8000);
    }
  } else if (remaining !== null && emissionPerDay && emissionPerDay > 0 && remaining > 0) {
    const daysToHalving = remaining / emissionPerDay;
    window.halvingDate = new Date(Date.now() + daysToHalving * 24 * 60 * 60 * 1000);
  } else {
    window.halvingDate = null;
  }

  // update pill tooltip only (we intentionally don't add other UI cards)
  const halvingPill = document.querySelector('.halving-pill');
  if (halvingPill) {
    const remainingSafe = Math.max(0, remaining || 0);
    const halvingSourceLabel = (window._halvingSupplySource === 'on-chain') ? 'On-chain (TotalIssuance)' : 'Taostats (circulating_supply)';
    // Multi-line tooltip for halving similar to price pill
    const halvingLines = [
      `Next halving: ${formatNumber(HALVING_SUPPLY)} TAO`,
      `Remaining: ${formatNumber(remainingSafe)} TAO`,
      `Source: ${halvingSourceLabel}`
    ];
    halvingPill.setAttribute('data-tooltip', halvingLines.join('\n'));
  }
  // We intentionally don't add a new stat-card for the halving; keep the pill-only UI.
  // store previous circulating and halving-supply snapshots for next refresh
  window._prevCircSupply = window.circulatingSupply;
  if (supplyForHalving !== null && supplyForHalving !== undefined) {
    window._prevHalvingSupply = supplyForHalving;
    window._prevHalvingTs = nowTs;
  }

  // Map preview only contains a thumbnail + button to open interactive map (no KPIs)

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
    // No theme-dependent behavior here; map swap is handled centrally in setLightMode().
  });

  document.querySelectorAll('.halving-pill').forEach(pill => {
    pill.addEventListener('mouseenter', e => showTooltip(e, pill.getAttribute('data-tooltip') || ''));
    pill.addEventListener('mouseleave', hideTooltip);
    pill.addEventListener('focus', e => showTooltip(e, pill.getAttribute('data-tooltip') || ''));
    pill.addEventListener('blur', hideTooltip);
    pill.addEventListener('click', e => {
      e.stopPropagation();
      showTooltip(e, pill.getAttribute('data-tooltip') || '');
      setTimeout(hideTooltip, 2500);
    });
  });

  document.querySelectorAll('.price-pill').forEach(pill => {
    pill.addEventListener('mouseenter', e => showTooltip(e, pill.getAttribute('data-tooltip') || ''));
    pill.addEventListener('mouseleave', hideTooltip);
    pill.addEventListener('focus', e => showTooltip(e, pill.getAttribute('data-tooltip') || ''));
    pill.addEventListener('blur', hideTooltip);
    pill.addEventListener('click', e => {
      e.stopPropagation();
      showTooltip(e, pill.getAttribute('data-tooltip') || '');
      setTimeout(hideTooltip, 2500);
    });
  });

  document.addEventListener('click', hideTooltip);
}

// ===== Version fetch and apply =====
async function fetchAndApplyVersion() {
  try {
    const res = await fetch('/VERSION', { cache: 'no-store' });
    if (!res.ok) return;
    let text = await res.text();
    if (!text) return;
    text = text.trim();
    if (!text) return;
    // Normalize: remove leading 'v' for processing, then re-add a single 'v' prefix.
    let raw = text.replace(/^v/i, '');
    // Normalize prerelease labels that use the `label.number` format to `labelnumber` (e.g. rc.1 -> rc1)
    raw = raw.replace(/-(rc|alpha|beta)\.(\d+)/i, (m, label, num) => `-${label}${num}`);
    // Keep other semver dots intact (e.g., 1.0.0). Ensure final display uses a single leading 'v'.
    text = `v${raw}`;
    const el = document.getElementById('siteVersion');
    if (el) el.textContent = text;
    // Optionally expose globally for other scripts
    window._siteVersion = text;
  } catch (err) {
    // Silent fallback — keep embedded version
    console.warn('⚠️ Could not fetch version:', err?.message || err);
  }
}

// Ensure the version is applied on page load
try {
  // Script is loaded with `defer`, but ensure DOM available
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchAndApplyVersion);
  } else {
    fetchAndApplyVersion();
  }
} catch (err) {
  console.warn('⚠️ Version loader failed to run:', err && err.message);
}
setupDynamicTooltips();

// ===== Data Refresh =====
async function refreshDashboard() {
  const [networkData, taoPrice, taostats] = await Promise.all([
    fetchNetworkData(),
    fetchTaoPrice(),
    fetchTaostats()
  ]);
  // Expose taostats globally for tooltips and other UI pieces
  window._taostats = taostats ?? null;
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
  const apiStatusIcon = document.querySelector('#apiStatusCard .stat-icon svg');
  let statusText = 'All systems ok';
  let color = '#22c55e'; // green
  if (!networkData || !taostats) {
    statusText = 'API error';
    color = '#ef4444'; // red
  } else if (!taostats.price || !taostats.volume_24h) {
    statusText = 'Partial data';
    color = '#eab308'; // yellow
  }
  if (apiStatusEl) apiStatusEl.textContent = statusText;
  // Dynamically update SVG colors
  if (apiStatusIcon) {
    // Update circle color
    const circle = apiStatusIcon.querySelector('circle');
    if (circle) circle.setAttribute('stroke', color);
    // Update heartbeat line color
    const polyline = apiStatusIcon.querySelector('polyline');
    if (polyline) polyline.setAttribute('stroke', color);
  }
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
  const [networkData, taoPrice, taostats] = await Promise.all([
    fetchNetworkData(),
    fetchTaoPrice(),
    fetchTaostats()
  ]);
  // Expose taostats globally and update UI after available
  window._taostats = taostats ?? null;
  await updateNetworkStats(networkData);
  updateTaoPrice(taoPrice);

    // TAO Tensor Law iframe fallback: hide iframe if blocked and show a friendly fallback message
    document.addEventListener('DOMContentLoaded', function() {
      const embed = document.getElementById('taotensorEmbed');
      const frame = document.getElementById('taotensorFrame');
      if (!embed || !frame) return;
      // If the iframe cannot load due to X-Frame-Options, we detect via a timeout and 'load' event
      let loaded = false;
      frame.addEventListener('load', function() { loaded = true; });
      // After a short delay, if the frame didn't load, show fallback
      setTimeout(function() {
        try {
          // Some browsers will block access; in that case, the 'load' event won't fire or will be blocked
          if (!loaded) {
            embed.classList.add('fallback-active');
          }
        } catch (e) {
          embed.classList.add('fallback-active');
        }
      }, 1500);
    });

  // Fill initial volume and expose taostats globally
  window._taostats = taostats ?? null;
  window._taostats = taostats ?? null;
  const volumeEl = document.getElementById('volume24h');
  if (volumeEl && taostats && typeof taostats.volume_24h === 'number') {
    volumeEl.textContent = `$${formatCompact(taostats.volume_24h)}`;
  }

  // Fill initial API status
  const apiStatusEl = document.getElementById('apiStatus');
  const apiStatusIcon = document.querySelector('#apiStatusCard .stat-icon svg');
  let statusText = 'All systems ok';
  let color = '#22c55e'; // green
  if (!networkData || !taostats) {
    statusText = 'API error';
    color = '#ef4444'; // red
  } else if (!taostats.price || !taostats.volume_24h) {
    statusText = 'Partial data';
    color = '#eab308'; // yellow
  }
  if (apiStatusEl) apiStatusEl.textContent = statusText;
  // Dynamically update SVG colors
  if (apiStatusIcon) {
    // Update circle color
    const circle = apiStatusIcon.querySelector('circle');
    if (circle) circle.setAttribute('stroke', color);
    // Update heartbeat line color
    const polyline = apiStatusIcon.querySelector('polyline');
    if (polyline) polyline.setAttribute('stroke', color);
  }

  const priceCard = document.querySelector('#priceChart')?.closest('.dashboard-card');
  const priceHistory = await fetchPriceHistory(currentPriceRange);
  if (priceHistory) {
    createPriceChart(priceHistory, currentPriceRange);
  }
  startHalvingCountdown();
  startAutoRefresh();
}

// ===== Halving Countdown =====
function startHalvingCountdown() {
  if (window.halvingInterval) clearInterval(window.halvingInterval);
  updateHalvingCountdown();
  window.halvingInterval = setInterval(updateHalvingCountdown, 1000);
}
// calculateHalvingDate removed: we compute halving date inline to maintain a single source of truth

/**
 * Generate fixed halving thresholds for the token supply.
 * Example: for maxSupply=21_000_000 and maxEvents=6 it returns [10.5M, 15.75M, ...]
 */
function generateHalvingThresholds(maxSupply = 21_000_000, maxEvents = 6) {
  const arr = [];
  for (let n = 1; n <= maxEvents; n++) {
    const threshold = Math.round(maxSupply * (1 - 1 / Math.pow(2, n)));
    arr.push(threshold);
  }
  return arr;
}
function updateHalvingCountdown() {
  const el = document.getElementById('halvingCountdown');
  if (!el || !window.halvingDate) {
    el.textContent = 'Calculating...';
    return;
  }
  const now = new Date();
  const diff = window.halvingDate - now;
  if (diff <= 0) {
    el.textContent = 'Halved!';
    return;
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  // Show days, hours, minutes, and seconds
  el.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
}
// Prevent link clicks on info-badge controls

// Fetch ATH/ATL data and update pills
async function updateAthAtlPills() {
  try {
    const res = await fetch('/api/ath-atl');
    if (!res.ok) throw new Error('ATH/ATL API error');
    const data = await res.json();
    const athValue = document.getElementById('athValue');
    const athDate = document.getElementById('athDate');
    const atlValue = document.getElementById('atlValue');
    const atlDate = document.getElementById('atlDate');
    if (athValue && data.ath) athValue.textContent = `$${Number(data.ath).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (athDate && data.ath_date) athDate.textContent = new Date(data.ath_date).toLocaleDateString('en-US');
    if (atlValue && data.atl) atlValue.textContent = `$${Number(data.atl).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (atlDate && data.atl_date) atlDate.textContent = new Date(data.atl_date).toLocaleDateString('en-US');
  } catch (err) {
    console.error('❌ updateAthAtlPills:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  (async () => {
    await initDashboard();
    await updateAthAtlPills();

    // Prevent link clicks on info-badge controls
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
      infoBadge.setAttribute('data-tooltip', 'API status: Network, Taostats, Coingecko');
    }
  })();

  // Background toggle button
  const btn = document.getElementById('bgToggleBtn');
  const moonIcon = document.getElementById('moonIcon');
  const sunIcon = document.getElementById('sunIcon');
  if (!btn || !moonIcon || !sunIcon) return;
  const body = document.body;
  // Initial state from localStorage
  const header = document.querySelector('header.site-header');
  // Add .pill-value directly and use Array.from() when querying NodeList
  // This is Safari-friendly (older versions may not support spread on NodeList)
  // Manually add the refresh indicator so it receives the `light-bg` class too
  const refreshIndicator = document.getElementById('refresh-indicator');
  const elementsToToggle = [
    body,
    header,
    refreshIndicator,
    ...Array.from(document.querySelectorAll('.dashboard-card, .stat-card, .price-pill, .halving-pill, .ath-atl-pill, .whitepaper-btn, #bgToggleBtn, .stat-value, .info-badge, .pill-value, .disclaimer-card, .site-footer'))
  ];
  function setLightMode(active) {
    elementsToToggle.forEach(el => {
      if (!el) return;
      if (active) {
        el.classList.add('light-bg');
      } else {
        el.classList.remove('light-bg');
      }
    });
    // JS fallback for browsers that do not fully respect CSS overrides (Safari, PWA quirks)
    // Apply inline styles to key elements to force proper Light Mode contrast
    const rootStyle = getComputedStyle(document.documentElement);
    const accent = (rootStyle.getPropertyValue('--accent') || '#22c55e').trim();
    const brand = (rootStyle.getPropertyValue('--brand') || '#ff6b35').trim();
    document.querySelectorAll('.disclaimer-card, .price-pill, .halving-pill').forEach(el => {
      if (!el) return;
      if (active) {
        if (el.classList.contains('disclaimer-card')) {
          el.style.background = '#fff';
          el.style.backgroundImage = 'none';
          el.style.border = '1px solid #c0c0c0';
          el.style.boxShadow = '0 12px 32px rgba(0,0,0,0.08)';
          el.style.color = '#000';
          el.style.backdropFilter = 'none';
          el.style.filter = 'none';
          // also set child elements explicitly to avoid CSS overrides
          const txt = el.querySelectorAll('.disclaimer-text, .disclaimer-header h3, .coingecko-attribution, .source-label');
          txt.forEach(ch => {
            ch.style.color = '#000';
            ch.style.opacity = '1';
            // Keep font weight unchanged so we don't alter the original design
            ch.style.fontWeight = '';
            ch.style.webkitTextFillColor = '#000';
          });
        }
          // Ensure anchor links inside disclaimer remain green in Light Mode (Safari fallback)
          const anchors = el.querySelectorAll('a');
          anchors.forEach(a => {
            a.style.setProperty('color', '#22c55e', 'important');
            a.style.setProperty('-webkit-text-fill-color', '#22c55e', 'important');
          });
        if (el.classList.contains('price-pill')) {
          el.style.background = '#fff';
          el.style.borderColor = '#dcdcdc';
          el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
          el.style.color = '#000';
          el.style.borderLeft = `4px solid ${accent}`;
        }
        if (el.classList.contains('halving-pill')) {
          el.style.background = '#fff';
          el.style.borderColor = '#dcdcdc';
          el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
          el.style.color = '#000';
          el.style.borderLeft = `4px solid ${brand}`;
        }
        // (Map thumbnail swap is handled once after this loop to avoid repeated DOM updates.)
      } else {
        // Remove inline styles to fall back to CSS rules for Dark Mode
        el.style.background = '';
        el.style.backgroundImage = '';
        el.style.border = '';
        el.style.borderColor = '';
        el.style.boxShadow = '';
        el.style.color = '';
        el.style.borderLeft = '';
        el.style.backdropFilter = '';
        el.style.filter = '';
        if (el.classList.contains('disclaimer-card')) {
          // clear inline styles from children
          const txt = el.querySelectorAll('.disclaimer-text, .disclaimer-header h3, .coingecko-attribution, .source-label');
          txt.forEach(ch => {
            ch.style.color = '';
            ch.style.opacity = '';
            ch.style.fontWeight = '';
            ch.style.webkitTextFillColor = '';
          });
          // clear anchor overrides as well
          el.querySelectorAll('a').forEach(a => {
            a.style.removeProperty('color');
            a.style.removeProperty('-webkit-text-fill-color');
          });
        }
      }
    });
    // Swap the miner map thumbnail once per theme change (only update once)
    const mapThumb = document.getElementById('mapThumb');
    if (mapThumb) {
      if (active) {
        const lightSrc = 'assets/miner-map-thumb-light.png';
        mapThumb.onerror = function() { /* fallback to dark */ mapThumb.onerror = null; mapThumb.src = 'assets/miner-map-thumb.png'; mapThumb.style.filter = ''; };
        mapThumb.src = lightSrc;
        // Ensure we don't apply additional CSS filter when using the light asset
        mapThumb.style.filter = 'none';
      } else {
        // Clear any error handler from previous attempts
        mapThumb.onerror = null;
        mapThumb.src = 'assets/miner-map-thumb.png';
        mapThumb.style.filter = '';
      }
    }

    if (active) {
      body.style.background = '#dadada';
      if (header) header.style.background = '#dadada';
      // JS fallback for footer in case CSS does not apply (Safari / PWA quirks)
      document.querySelectorAll('.site-footer').forEach(f => {
        f.style.background = '#dadada';
        f.style.color = '#222';
        // Ensure paragraphs inside the footer are readable
        const p = f.querySelectorAll('p');
        p.forEach(el => {
          el.style.color = '#222';
          el.style.opacity = '1';
          el.style.webkitTextFillColor = '#222';
        });
      });
      moonIcon.style.display = 'none';
      sunIcon.style.display = 'inline';
    } else {
      body.style.background = '';
      if (header) header.style.background = '';
      document.querySelectorAll('.site-footer').forEach(f => {
        f.style.background = '';
        f.style.color = '';
        const p = f.querySelectorAll('p');
        p.forEach(el => {
          el.style.color = '';
          el.style.opacity = '';
          el.style.webkitTextFillColor = '';
        });
      });
      moonIcon.style.display = 'inline';
      sunIcon.style.display = 'none';
    }
  }
  // NOTE: Preloading is handled via <link rel="preload"> in index.html — avoid duplicate downloads
  // Initial state
  setLightMode(localStorage.getItem('bgMode') === 'light');
  btn.addEventListener('click', function() {
    const isLight = body.classList.contains('light-bg');
    setLightMode(!isLight);
    localStorage.setItem('bgMode', isLight ? 'dark' : 'light');
  });
});