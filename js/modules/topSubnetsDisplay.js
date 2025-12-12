// ===== Top Subnets Display Module (ES6) =====
// Display card showing top 10 subnets with ranking changes

/**
 * Load and display top 10 subnets with ranking changes
 * @param {HTMLElement} displayList - The tbody element to populate
 */
export async function loadTopSubnetsDisplay(displayList) {
  if (!displayList) return;

  try {
    // Fetch current data and history in parallel
    const [currentRes, historyRes] = await Promise.all([
      fetch('/api/top_subnets'),
      fetch('/api/top_subnets_history?limit=96')  // ~24h of history at 15min intervals
    ]);

    if (!currentRes.ok) throw new Error('Failed to fetch top subnets');
    const currentData = await currentRes.json();
    const topSubnets = currentData.top_subnets || [];

    if (topSubnets.length === 0) {
      displayList.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">No subnet data available</td></tr>';
      return;
    }

    // Build previous ranking map from history
    let prevRankMap = {}; // netuid -> previous rank (1-based)
    try {
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        const history = historyData.history || [];
        // Get the oldest snapshot in history (for 24h comparison)
        if (history.length >= 1) {
          const prevSnapshot = history[0];  // First = oldest
          // History stores in 'entries' array with 'id' for netuid
          const prevSubnets = prevSnapshot.entries || prevSnapshot.top_subnets || [];
          prevSubnets.forEach((s, idx) => {
            // Use 'id' from history (netuid as string) or 'netuid'
            const netuid = s.id || s.netuid;
            if (netuid) prevRankMap[parseInt(netuid)] = idx + 1;
          });
        }
      }
    } catch (e) {
      console.warn('Could not load subnet history for ranking:', e);
    }

    // Display TOP 10 with ranking changes
    const rows = topSubnets.slice(0, 10).map((subnet, idx) => {
      const rank = idx + 1;
      const netuid = subnet.netuid;
      const name = subnet.subnet_name || subnet.taostats_name || `SN${netuid}`;
      const share = ((subnet.taostats_emission_share || 0) * 100).toFixed(2);
      const daily = (subnet.estimated_emission_daily || 0).toFixed(2);

      // Calculate rank change
      let changeHtml = '';
      const prevRank = prevRankMap[netuid];

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
        <td class="subnet-col"><span class="sn-id">SN${netuid}</span> ${name}</td>
        <td class="share-col">${share}%</td>
        <td class="daily-col">${daily}τ</td>
      </tr>`;
    }).join('');

    displayList.innerHTML = rows;
  } catch (err) {
    console.error('Error loading top subnets for display:', err);
    displayList.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">Error loading subnet data</td></tr>';
  }
}

/**
 * Initialize top subnets display card
 * @returns {Function|null} The refresh function, or null if elements not found
 */
export function initTopSubnetsDisplay() {
  const displayTable = document.getElementById('topSubnetsDisplayTable');
  const displayList = document.getElementById('topSubnetsDisplayList');

  if (!displayTable || !displayList) return null;

  // Initial load
  loadTopSubnetsDisplay(displayList);

  // Return the refresh function for external use
  return () => loadTopSubnetsDisplay(displayList);
}
