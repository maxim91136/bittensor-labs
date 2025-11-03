// filepath: script.js
const CACHE_DURATION = 5 * 60 * 1000; // 5 Min.

async function safeParseJSON(str) {
    try { return JSON.parse(str); } catch { return null; }
}

async function getCachedOrFetch(key, fetchFn) {
    try {
        const cachedRaw = localStorage.getItem(key);
        if (cachedRaw) {
            const cached = safeParseJSON(cachedRaw);
            if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) return cached.data;
        }
    } catch (e) {
        console.warn('Cache read failed', e);
    }

    const data = await fetchFn();
    try {
        localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) {
        console.warn('Cache write failed', e);
    }
    return data;
}

async function fetchTaoPrice() {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bittensor&vs_currencies=usd');
    if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
    const json = await res.json();
    const price = json?.bittensor?.usd;
    if (price == null) throw new Error('Taopreis nicht gefunden');
    return Number(price);
}

async function fetchValidators() {
    const res = await fetch('https://entrypoint-finney.opentensor.ai:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: 1, jsonrpc: '2.0', method: 'subtensor.get_top_validators',
            params: { netuid: 1, topk: 10 }
        })
    });
    if (!res.ok) throw new Error(`Validators API error: ${res.status}`);
    const json = await res.json();
    const result = json?.result ?? {};
    const hotkeys = Array.isArray(result.hotkeys) ? result.hotkeys : [];
    const stakes = Array.isArray(result.stakes) ? result.stakes.map(s => Number(s) || 0) : [];
    return { hotkeys, stakes };
}

function safeGetEl(id) {
    const el = document.getElementById(id);
    if (!el) console.warn(`Element #${id} nicht gefunden`);
    return el;
}

async function loadDashboard() {
    try {
        const price = await getCachedOrFetch('taoPrice', fetchTaoPrice);
        const priceEl = safeGetEl('taoPrice');
        if (priceEl) priceEl.textContent = `$${Number(price).toFixed(2)}`;

        const validators = await getCachedOrFetch('validators', fetchValidators);
        const canvas = safeGetEl('validatorsChart');
        if (canvas && window.Chart) {
            const ctxV = canvas.getContext('2d');
            const labels = validators.hotkeys.slice(0,5).map(h => (h || '').slice(0,8) + '...');
            const data = validators.stakes.slice(0,5).map(v => Number(v) || 0);
            new Chart(ctxV, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{ label: 'Stake', data, backgroundColor: '#ff6b35' }]
                },
                options: { scales: { y: { beginAtZero: true } } }
            });
        } else if (!window.Chart) {
            console.warn('Chart.js nicht geladen — Diagramm wird nicht gerendert.');
        }
    } catch (err) {
        console.error('Fehler beim Laden des Dashboards:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            localStorage.removeItem('taoPrice');
            localStorage.removeItem('validators');
            loadDashboard();
        });
    } else {
        console.warn('#refreshBtn nicht gefunden');
    }
    loadDashboard();
});