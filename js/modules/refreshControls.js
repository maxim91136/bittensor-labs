// ===== Refresh Controls Module (ES6) =====
// Auto-refresh countdown with pause/resume functionality

import { showSystemFailureEasterEgg, triggerNeoEasterEgg } from './easterEggs.js';

// Configuration
const REFRESH_SECONDS = 60;
const SYSTEM_FAILURE_COOLDOWN_MS = 30000; // 30 seconds cooldown after triggering

// Module state
let _refreshCountdown = REFRESH_SECONDS;
let _refreshTimer = null;
let _refreshPaused = false;
let _refreshClickTimestamps = [];
let _autoRefreshCount = 0;
let _lastSystemFailureTime = 0; // Timestamp of last system failure trigger

// Callbacks (set via init)
let _refreshDashboard = null;
let _MatrixSound = null;

/**
 * Get current refresh state
 * @returns {Object} Current state
 */
export function getRefreshState() {
  return {
    countdown: _refreshCountdown,
    paused: _refreshPaused,
    autoRefreshCount: _autoRefreshCount
  };
}

/**
 * Check if refresh is paused
 * @returns {boolean}
 */
export function isRefreshPaused() {
  return _refreshPaused;
}

/**
 * Render the refresh indicator UI
 */
export function renderRefreshIndicator() {
  const el = document.getElementById('refresh-indicator');
  if (!el) return;

  // If paused, show "System failure" state
  if (_refreshPaused) {
    el.innerHTML = `
      <span class="failure-text">SYS_FAIL</span>
    `;
    el.title = 'System failure - Triple-click to resume';
    el.classList.add('system-failure');
    el.style.cursor = 'pointer';
    return;
  }

  el.classList.remove('system-failure');
  const progress = (_refreshCountdown / REFRESH_SECONDS);
  el.innerHTML = `
    <svg viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="8" stroke="#222" stroke-width="2.2" fill="none"/>
      <circle cx="10" cy="10" r="8" stroke="#22c55e" stroke-width="2.2" fill="none"
        stroke-dasharray="${2 * Math.PI * 8}" stroke-dashoffset="${2 * Math.PI * 8 * (1 - progress)}"
        style="transition: stroke-dashoffset 0.5s;"/>
    </svg>
    <span class="refresh-label">${_refreshCountdown}</span>
  `;
  el.title = `Auto-refresh in ${_refreshCountdown}s - Triple-click to pause`;
  el.style.cursor = 'pointer';
}

/**
 * Handle click on refresh indicator
 */
export function handleRefreshClick() {
  const now = Date.now();
  _refreshClickTimestamps.push(now);

  // Keep only clicks within last 600ms
  _refreshClickTimestamps = _refreshClickTimestamps.filter(t => now - t < 600);

  // Triple-click detection
  if (_refreshClickTimestamps.length >= 3) {
    _refreshClickTimestamps = [];
    toggleRefreshPause();
    return;
  }

  // Single click - reset countdown and refresh (if not paused)
  if (!_refreshPaused) {
    _refreshCountdown = REFRESH_SECONDS;
    if (_refreshDashboard) _refreshDashboard();
    renderRefreshIndicator();
  }
}

/**
 * Toggle refresh pause state
 */
export function toggleRefreshPause() {
  const now = Date.now();

  // If trying to trigger system failure, check cooldown
  if (!_refreshPaused) {
    const timeSinceLastFailure = now - _lastSystemFailureTime;
    if (timeSinceLastFailure < SYSTEM_FAILURE_COOLDOWN_MS) {
      // Still in cooldown - play a small sound but don't trigger
      if (_MatrixSound?.play) _MatrixSound.play('refresh-beep');
      if (window._debug) console.debug(`System failure cooldown: ${Math.ceil((SYSTEM_FAILURE_COOLDOWN_MS - timeSinceLastFailure) / 1000)}s remaining`);
      return;
    }
    // Set the timestamp for this trigger
    _lastSystemFailureTime = now;
  }

  _refreshPaused = !_refreshPaused;

  if (_refreshPaused) {
    // Stop the timer
    if (_refreshTimer) {
      clearInterval(_refreshTimer);
      _refreshTimer = null;
    }
    // Play glitch effect for dramatic "crash"
    if (typeof window.showMatrixGlitch === 'function') {
      window.showMatrixGlitch({ duration: 800, intensity: 3 });
    }
    if (_MatrixSound?.play) _MatrixSound.play('glitch');
    renderRefreshIndicator();
    // Show Matrix-style "SYSTEM FAILURE" Easter Egg
    showSystemFailureEasterEgg({
      setRefreshPaused: (val) => { _refreshPaused = val; },
      setRefreshCountdown: (val) => { _refreshCountdown = val; },
      REFRESH_SECONDS,
      renderRefreshIndicator,
      startAutoRefresh,
      MatrixSound: _MatrixSound
    });
  } else {
    // Resume - restart the auto-refresh
    _refreshCountdown = REFRESH_SECONDS;
    renderRefreshIndicator();
    startAutoRefresh();
    if (_MatrixSound?.play) _MatrixSound.play('refresh-beep');
  }
}

/**
 * Start the auto-refresh timer
 */
export function startAutoRefresh() {
  if (_refreshPaused) return;
  renderRefreshIndicator();
  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = setInterval(() => {
    if (_refreshPaused) return;
    _refreshCountdown--;
    if (_refreshCountdown <= 0) {
      _refreshCountdown = REFRESH_SECONDS;
      _autoRefreshCount++;
      // Trigger Matrix glitch only every 3rd auto-refresh
      if (_autoRefreshCount % 3 === 0) {
        try {
          if (typeof window.showMatrixGlitch === 'function') {
            window.showMatrixGlitch({ duration: 360, intensity: 1 });
          }
        } catch (e) {
          if (window._debug) console.warn('showMatrixGlitch failed', e);
        }
      }
      // Trigger "Wake up, Neo" Easter egg after 5th refresh (once)
      if (_autoRefreshCount === 5) {
        triggerNeoEasterEgg(_MatrixSound);
      }
      if (_MatrixSound?.play) _MatrixSound.play('refresh-beep');
      if (_refreshDashboard) _refreshDashboard();
    }
    renderRefreshIndicator();
  }, 1000);
  const el = document.getElementById('refresh-indicator');
  if (el) {
    el.onclick = handleRefreshClick;
  }
}

/**
 * Initialize refresh controls
 * @param {Object} options - Configuration options
 * @param {Function} options.refreshDashboard - Function to call on refresh
 * @param {Object} options.MatrixSound - MatrixSound instance for audio
 */
export function initRefreshControls(options = {}) {
  const { refreshDashboard, MatrixSound } = options;
  _refreshDashboard = refreshDashboard;
  _MatrixSound = MatrixSound;

  function setup() {
    const refreshIndicator = document.getElementById('refresh-indicator');
    if (refreshIndicator) {
      refreshIndicator.onclick = handleRefreshClick;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
}

/**
 * Ensure auto-refresh is started (called from outside)
 */
export function ensureAutoRefreshStarted() {
  if (!_refreshTimer && !_refreshPaused) {
    startAutoRefresh();
  }
}
