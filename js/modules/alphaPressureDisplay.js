// ===== Alpha Pressure Display Module (ES6) =====
// Shows subnet alpha token buying/selling pressure with filters and favorites

const FAVORITES_KEY = 'alphaPressure_favorites';

/**
 * Get favorites from localStorage
 */
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Save favorites to localStorage
 */
function saveFavorites(favorites) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

/**
 * Toggle favorite status for a netuid
 */
function toggleFavorite(netuid) {
  const favorites = getFavorites();
  const idx = favorites.indexOf(netuid);
  if (idx >= 0) {
    favorites.splice(idx, 1);
  } else {
    favorites.push(netuid);
  }
  saveFavorites(favorites);
  return favorites;
}

/**
 * Initialize Alpha Pressure Card with filters and favorites
 */
export function initAlphaPressureCard() {
  const container = document.getElementById('alphaPressureCard');
  if (!container) return;

  // Store state
  let currentFilter = 'all'; // all, favorites, buying, selling
  let allData = [];

  // Setup filter buttons
  const filterBtns = container.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderTable(allData, currentFilter);
    });
  });

  // Load data
  loadAlphaPressureData().then(data => {
    allData = data;
    renderTable(data, currentFilter);
  });
}

/**
 * Fetch Alpha Pressure data from API
 */
async function loadAlphaPressureData() {
  try {
    const res = await fetch('/api/alpha_pressure?limit=100');
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    return data.subnets || [];
  } catch (err) {
    console.error('Error loading alpha pressure:', err);
    return [];
  }
}

/**
 * Render the table based on current filter
 */
function renderTable(subnets, filter = 'all') {
  const displayList = document.getElementById('alphaPressureList');
  const summaryEl = document.getElementById('alphaPressureSummary');
  if (!displayList) return;

  const favorites = getFavorites();

  // Filter subnets
  let filtered = [...subnets];
  switch (filter) {
    case 'favorites':
      filtered = subnets.filter(s => favorites.includes(s.netuid));
      break;
    case 'buying':
      filtered = subnets.filter(s => s.alpha_pressure_30d >= 0);
      break;
    case 'selling':
      filtered = subnets.filter(s => s.alpha_pressure_30d < 0);
      break;
  }

  // Sort: worst first for selling, best first for buying
  if (filter === 'buying') {
    filtered.sort((a, b) => b.alpha_pressure_30d - a.alpha_pressure_30d);
  } else {
    filtered.sort((a, b) => a.alpha_pressure_30d - b.alpha_pressure_30d);
  }

  // Limit display
  const displayData = filtered.slice(0, 15);

  if (displayData.length === 0) {
    displayList.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;">
      ${filter === 'favorites' ? 'No favorites yet. Click ★ to add.' : 'No data available'}
    </td></tr>`;
    return;
  }

  const rows = displayData.map(s => {
    const isFavorite = favorites.includes(s.netuid);
    const pressure = s.alpha_pressure_30d;
    const pressureFormatted = pressure >= 0 ? `+${pressure.toFixed(0)}%` : `${pressure.toFixed(0)}%`;

    // Format flows with color
    const flow7d = s.net_flow_7d_tao || 0;
    const flow30d = s.net_flow_30d_tao || 0;
    const flow7dFormatted = flow7d >= 0 ? `+${Math.round(flow7d).toLocaleString()}` : Math.round(flow7d).toLocaleString();
    const flow30dFormatted = flow30d >= 0 ? `+${Math.round(flow30d).toLocaleString()}` : Math.round(flow30d).toLocaleString();
    const flow7dClass = flow7d >= 0 ? 'flow-positive' : 'flow-negative';
    const flow30dClass = flow30d >= 0 ? 'flow-positive' : 'flow-negative';

    // Color class based on pressure
    let pressureClass = 'pressure-neutral';
    if (pressure >= 100) pressureClass = 'pressure-strong-buy';
    else if (pressure >= 50) pressureClass = 'pressure-accumulation';
    else if (pressure >= 0) pressureClass = 'pressure-neutral';
    else if (pressure >= -50) pressureClass = 'pressure-sell';
    else pressureClass = 'pressure-heavy-sell';

    return `<tr data-netuid="${s.netuid}">
      <td class="fav-col">
        <button class="fav-btn ${isFavorite ? 'active' : ''}" data-netuid="${s.netuid}" title="Add to favorites">
          ${isFavorite ? '★' : '☆'}
        </button>
      </td>
      <td class="subnet-col">
        <span class="subnet-name">${s.name}</span>
        <span class="subnet-id">SN${s.netuid}</span>
      </td>
      <td class="flow-col ${flow7dClass}">${flow7dFormatted}</td>
      <td class="flow-col ${flow30dClass}">${flow30dFormatted}</td>
      <td class="pressure-col ${pressureClass}">${s.emoji} ${pressureFormatted}</td>
      <td class="trend-col">${s.trend_emoji}</td>
    </tr>`;
  }).join('');

  displayList.innerHTML = rows;

  // Add click handlers for favorite buttons
  displayList.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const netuid = parseInt(btn.dataset.netuid);
      const newFavorites = toggleFavorite(netuid);
      const isNowFavorite = newFavorites.includes(netuid);
      btn.classList.toggle('active', isNowFavorite);
      btn.textContent = isNowFavorite ? '★' : '☆';

      // Update favorites count
      updateFavoritesCount(subnets);
    });
  });

  // Update summary
  if (summaryEl) {
    const buying = subnets.filter(s => s.alpha_pressure_30d >= 50).length;
    const neutral = subnets.filter(s => s.alpha_pressure_30d >= 0 && s.alpha_pressure_30d < 50).length;
    const selling = subnets.filter(s => s.alpha_pressure_30d < 0).length;
    summaryEl.innerHTML = `
      <span class="summary-item summary-good" title="Accumulation">🟢 ${buying}</span>
      <span class="summary-item summary-neutral" title="Neutral">🟡 ${neutral}</span>
      <span class="summary-item summary-bad" title="Selling Pressure">🔴 ${selling}</span>
    `;
  }

  updateFavoritesCount(subnets);
}

/**
 * Update the favorites count badge
 */
function updateFavoritesCount(subnets) {
  const favBtn = document.querySelector('.filter-btn[data-filter="favorites"]');
  if (favBtn) {
    const favorites = getFavorites();
    const count = subnets.filter(s => favorites.includes(s.netuid)).length;
    const badge = favBtn.querySelector('.fav-count') || document.createElement('span');
    badge.className = 'fav-count';
    badge.textContent = count > 0 ? ` (${count})` : '';
    if (!favBtn.querySelector('.fav-count')) {
      favBtn.appendChild(badge);
    }
  }
}

/**
 * Legacy function for backwards compatibility
 */
export async function loadAlphaPressureDisplay(displayList, options = {}) {
  if (!displayList) return;
  // Just trigger the card init
  initAlphaPressureCard();
}
