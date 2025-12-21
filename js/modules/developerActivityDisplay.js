/**
 * Developer Activity Display Module
 * Fetches and displays GitHub developer activity from opentensor repos
 * Data source: KV key "github_activity" (updated every 6h by workflow)
 */

// KV endpoint
const KV_BASE = 'https://pub-1fed43d66fb6403fab04464bb7c24442.r2.dev/bittensor-metrics';

/**
 * Fetch GitHub activity data from KV
 */
async function fetchGitHubActivity() {
  try {
    const response = await fetch(`${KV_BASE}/github_activity.json`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.warn('Failed to fetch GitHub activity:', error);
    return null;
  }
}

/**
 * Format a repo name for display (remove org prefix)
 */
function formatRepoName(fullName) {
  // "opentensor/bittensor" -> "bittensor"
  return fullName.split('/').pop();
}

/**
 * Format relative time from ISO timestamp
 */
function formatRelativeTime(isoTimestamp) {
  if (!isoTimestamp) return '—';

  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

/**
 * Update the Developer Activity card with data
 */
function updateDeveloperActivityCard(data) {
  if (!data || !data.totals) {
    console.warn('No GitHub activity data available');
    return;
  }

  const totals = data.totals;
  const repos = data.repos || [];

  // Update headline metrics
  const activeDevs30d = document.getElementById('devActiveDevs30d');
  const activeDevs7d = document.getElementById('devActiveDevs7d');
  const commits30d = document.getElementById('devCommits30d');
  const commits7d = document.getElementById('devCommits7d');
  const contributors = document.getElementById('devContributors');

  if (activeDevs30d) {
    activeDevs30d.textContent = totals.active_devs_30d?.toLocaleString() || '—';
  }

  if (activeDevs7d && totals.active_devs_7d !== undefined) {
    activeDevs7d.textContent = `+${totals.active_devs_7d} (7d)`;
  }

  if (commits30d) {
    commits30d.textContent = totals.commits_30d?.toLocaleString() || '—';
  }

  if (commits7d && totals.commits_7d !== undefined) {
    commits7d.textContent = `+${totals.commits_7d} (7d)`;
  }

  if (contributors) {
    contributors.textContent = totals.total_contributors?.toLocaleString() || '—';
  }

  // Update repository breakdown
  const reposList = document.getElementById('devReposList');
  if (reposList && repos.length > 0) {
    // Find max commits for scaling bars
    const maxCommits = Math.max(...repos.map(r => r.commits_30d || 0));

    reposList.innerHTML = repos.map(repo => {
      const repoName = formatRepoName(repo.repo);
      const commits = repo.commits_30d || 0;
      const barWidth = maxCommits > 0 ? (commits / maxCommits) * 100 : 0;
      const activeDev = repo.active_devs_30d || 0;

      return `
        <div class="dev-repo-item">
          <span class="dev-repo-name" title="${repo.repo}">${repoName}</span>
          <div class="dev-repo-bar-container">
            <div class="dev-repo-bar" style="width: ${barWidth}%"></div>
          </div>
          <span class="dev-repo-commits">${commits} commits</span>
        </div>
      `;
    }).join('');
  }

  // Update timestamp
  const updateEl = document.getElementById('devActivityUpdate');
  if (updateEl && data._timestamp) {
    updateEl.textContent = `Updated: ${formatRelativeTime(data._timestamp)}`;
  }
}

/**
 * Initialize the Developer Activity display
 */
async function initDeveloperActivityDisplay() {
  const card = document.getElementById('developerActivityCard');
  if (!card) return null;

  // Fetch and display data
  const data = await fetchGitHubActivity();
  if (data) {
    updateDeveloperActivityCard(data);
  }

  // Return refresh function
  return async () => {
    const freshData = await fetchGitHubActivity();
    if (freshData) {
      updateDeveloperActivityCard(freshData);
    }
  };
}

// ES6 Module Exports
export {
  initDeveloperActivityDisplay,
  fetchGitHubActivity,
  updateDeveloperActivityCard
};
