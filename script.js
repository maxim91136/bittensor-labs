// API Endpoints
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Network Stats
async function fetchNetworkStats() {
  try {
    const res = await fetch('/api/network');
    const data = await res.json();
    return data;
  } catch {
    return { blockHeight: null, validators: 500, subnets: 142, emission: '7,200' };
  }
}

// TAO Price
async function fetchTaoPrice() {
  try {
    const res = await fetch(`${COINGECKO_API}/simple/price?ids=bittensor&vs_currencies=usd&include_24hr_change=true`);
    const data = await res.json();
    return {
      price: data.bittensor?.usd || null,
      change: data.bittensor?.usd_24h_change || 0
    };
  } catch {
    return { price: null, change: 0 };
  }
}

// UI Update
function updateUI(stats, price) {
  const el = (id, text) => {
    const e = document.getElementById(id);
    if (e) e.textContent = text;
  };

  el('blockHeight', stats.blockHeight ? stats.blockHeight.toLocaleString('de-DE') : 'N/A');
  el('validators', stats.validators ? stats.validators.toLocaleString('de-DE') : 'N/A');
  el('subnets', stats.subnets ? stats.subnets.toLocaleString('de-DE') : 'N/A');
  el('emission', `${stats.emission} τ/day`);
  el('taoPrice', price.price ? `$${price.price.toFixed(2)}` : 'N/A');
}

// Charts (Mock)
function initCharts() {
  if (typeof Chart === 'undefined') return;

  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(42,53,68,0.3)' }, ticks: { color: '#94a3b8' } },
      y: { grid: { color: 'rgba(42,53,68,0.3)' }, ticks: { color: '#94a3b8' } }
    }
  };

  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);

  const vCtx = document.getElementById('validatorsChart');
  if (vCtx) {
    new Chart(vCtx, {
      type: 'line',
      data: {
        labels: hours,
        datasets: [{
          data: Array.from({ length: 24 }, () => Math.floor(Math.random() * 50) + 480),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true
        }]
      },
      options: opts
    });
  }

  const pCtx = document.getElementById('priceChart');
  if (pCtx) {
    new Chart(pCtx, {
      type: 'line',
      data: {
        labels: hours,
        datasets: [{
          data: Array.from({ length: 24 }, () => Math.random() * 30 + 460),
          borderColor: '#fb923c',
          backgroundColor: 'rgba(251,146,60,0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true
        }]
      },
      options: opts
    });
  }
}

// Init
async function init() {
  console.log('🚀 Loading...');
  const [stats, price] = await Promise.all([fetchNetworkStats(), fetchTaoPrice()]);
  updateUI(stats, price);
  if (typeof Chart !== 'undefined') initCharts();
  console.log('✅ Ready');
}

// Update Network Stats
async function updateNetworkStats() {
  try {
    const res = await fetch('/api/network');
    const data = await res.json();

    if (data.blockHeight) {
      document.getElementById('blockHeight').textContent = data.blockHeight.toLocaleString();
    }
    if (data.validators) {
      document.getElementById('validators').textContent = data.validators.toLocaleString();
    }
    if (data.subnets) {
      document.getElementById('subnets').textContent = data.subnets.toLocaleString();
    }
    if (data.emission) {
      document.getElementById('emission').textContent = data.emission + ' τ/day';
    }
    if (data.totalNeurons) {
      document.getElementById('totalNeurons').textContent = data.totalNeurons.toLocaleString() + ' Neurons';
    }

  } catch {
    console.error('Failed to update network stats');
  }
}

document.addEventListener('DOMContentLoaded', init);
setInterval(init, 60000);