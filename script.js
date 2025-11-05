// API Endpoints
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

const $ = (id) => document.getElementById(id);
const fmt = (n) => new Intl.NumberFormat('de-DE').format(Number(n || 0));

let lastPrice = null;

// Network
async function loadNetwork() {
  try {
    const res = await fetch('/api/network', { cache: 'no-store' });
    const d = await res.json();

    $('blockHeight') && ($('blockHeight').textContent = fmt(d.blockHeight ?? 0));
    $('validators') && ($('validators').textContent = fmt(d.activeValidators ?? d.validators ?? 0));
    $('subnets') && ($('subnets').textContent = fmt(d.subnets ?? 0));
    $('emission') && ($('emission').textContent = `${d.emission ?? '0'} τ/day`);

    const tn = $('totalNeurons');
    if (tn) {
      tn.textContent = fmt(d.activeNeurons ?? d.totalNeurons ?? 0);
      tn.classList.remove('skeleton-text');
    }
  } catch (e) {
    console.error('Network load failed', e);
  }
}

// Price (weniger häufig wegen Rate Limits)
async function loadPrice() {
  try {
    const res = await fetch(`${COINGECKO_API}/simple/price?ids=bittensor&vs_currencies=usd&include_24hr_change=true`, { cache: 'no-store' });
    const data = await res.json();
    const p = data?.bittensor?.usd ?? null;

    if (p != null) {
      const el = $('taoPrice');
      const pill = $('taoPricePill');

      if (lastPrice != null && p !== lastPrice) {
        // Blink grün (steigt) oder rot (fällt)
        pill.classList.remove('blink-green', 'blink-red');
        void pill.offsetWidth; // Reflow trigger
        pill.classList.add(p > lastPrice ? 'blink-green' : 'blink-red');
        setTimeout(() => pill.classList.remove('blink-green', 'blink-red'), 600);
      }

      lastPrice = p;
      if (el) el.textContent = `$${Number(p).toFixed(2)}`;
    }
  } catch (e) {
    // ignore
  } finally {
    const el = $('taoPrice');
    if (el) el.textContent = lastPrice != null ? `$${Number(lastPrice).toFixed(2)}` : 'N/A';
  }
}

// History
async function loadHistory() {
  try {
    const res = await fetch('/api/history', { cache: 'no-store' });
    const hist = await res.json();
    // Debug sichtbar machen
    console.log('history points:', Array.isArray(hist) ? hist.length : 0);
    window.__bittensorHistory = hist;
  } catch (e) {
    console.warn('History load failed', e);
  }
}

// Init + Interval
document.addEventListener('DOMContentLoaded', () => {
  loadNetwork();
  loadPrice();
  // alle 60s nur Network updaten
  setInterval(loadNetwork, 60_000);
  // Preis alle 5 Min, um Limits zu schonen
  setInterval(loadPrice, 300_000);
  // History alle 10 Min
  setInterval(loadHistory, 600_000);
});