// ===== Top Validators Display Module (ES6) =====
// Display card showing top 10 validators with ranking changes

/**
 * Load and display top 10 validators with ranking changes
 * @param {HTMLElement} displayList - The tbody element to populate
 */
export async function loadTopValidatorsDisplay(displayList) {
  if (!displayList) return;

  try {
    // Fetch current data and history in parallel
    const [currentRes, historyRes] = await Promise.all([
      fetch('/api/top_validators'),
      fetch('/api/top_validators_history?limit=96')  // ~24h of history
    ]);

    if (!currentRes.ok) throw new Error('Failed to fetch top validators');
    const data = await currentRes.json();

    const topValidators = data.top_validators || [];
    if (topValidators.length === 0) {
      displayList.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">No validator data available</td></tr>';
      return;
    }

    // Build previous ranking map from history
    let prevRankMap = {}; // hotkey/id -> previous rank (1-based)
    try {
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        const history = historyData.history || [];
        // Get the oldest snapshot in history (for 24h comparison)
        if (history.length >= 1) {
          const prevSnapshot = history[0];  // First = oldest
          // History stores in 'entries' array with 'id' for hotkey
          const prevValidators = prevSnapshot.entries || prevSnapshot.top_validators || [];
          prevValidators.forEach((v, idx) => {
            // Use 'id' (hotkey) from history snapshot
            const key = v.id || v.hotkey;
            if (key) prevRankMap[key] = idx + 1;
          });
        }
      }
    } catch (e) {
      console.warn('Could not load validator history for ranking:', e);
    }

    // Display TOP 10 with ranking changes
    const rows = topValidators.slice(0, 10).map((v, idx) => {
      const rank = idx + 1;
      const hotkey = v.hotkey;
      const name = v.name || `Validator ${rank}`;
      const stake = v.stake_formatted || '—';
      const dominance = v.dominance != null ? `${v.dominance}%` : '—';
      const nominators = v.nominators != null ? v.nominators.toLocaleString() : '—';

      // Calculate rank change
      let changeHtml = '';
      const prevRank = prevRankMap[hotkey];

      if (prevRank === undefined && Object.keys(prevRankMap).length > 0) {
        changeHtml = ' <span class="rank-new">NEW</span>';
      } else if (prevRank > rank) {
        const diff = prevRank - rank;
        changeHtml = ` <span class="rank-up">▲${diff}</span>`;
      } else if (prevRank < rank) {
        const diff = rank - prevRank;
        changeHtml = ` <span class="rank-down">▼${diff}</span>`;
      }

      return `<tr>
        <td class="rank-col">${rank}${changeHtml}</td>
        <td class="validator-col">${name}</td>
        <td class="stake-col">${stake}</td>
        <td class="dominance-col">${dominance}</td>
        <td class="nominators-col">${nominators}</td>
      </tr>`;
    }).join('');

    displayList.innerHTML = rows;
  } catch (err) {
    console.error('Error loading top validators:', err);
    displayList.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">Error loading validator data</td></tr>';
  }
}

/**
 * Initialize top validators display card
 * @returns {Function|null} The refresh function, or null if elements not found
 */
export function initTopValidatorsDisplay() {
  const displayTable = document.getElementById('topValidatorsDisplayTable');
  const displayList = document.getElementById('topValidatorsDisplayList');

  if (!displayTable || !displayList) return null;

  // Initial load
  loadTopValidatorsDisplay(displayList);

  // Return the refresh function for external use
  return () => loadTopValidatorsDisplay(displayList);
}
