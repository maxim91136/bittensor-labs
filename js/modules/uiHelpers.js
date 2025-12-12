// ===== UI Helpers Module (ES6) =====
// Small UI utilities: sound toggle, FNG badge positioning

/**
 * Initialize sound toggle button
 * @param {Object} MatrixSound - MatrixSound module reference
 */
export function initSoundToggle(MatrixSound) {
  const soundBtn = document.getElementById('soundToggleBtn');
  const soundOnIcon = document.getElementById('soundOnIcon');
  const soundOffIcon = document.getElementById('soundOffIcon');
  const soundMusicNote = document.getElementById('soundMusicNote');

  if (!soundBtn || !soundOnIcon || !soundOffIcon) return;

  function updateSoundIcon() {
    const soundEnabled = MatrixSound.isEnabled();
    soundOnIcon.style.display = soundEnabled ? 'inline' : 'none';
    soundOffIcon.style.display = soundEnabled ? 'none' : 'inline';

    // Update music note color on mobile
    if (soundMusicNote) {
      soundMusicNote.style.color = soundEnabled ? '#22c55e' : '#ef4444';
    }
  }

  // Initialize icon on page load
  updateSoundIcon();

  // Toggle sound on click
  soundBtn.addEventListener('click', function() {
    MatrixSound.toggleSound();
    updateSoundIcon();

    // Play a test sound if we just enabled it
    if (MatrixSound.isEnabled()) {
      MatrixSound.play('boot-ready');
    }
  });
}

/**
 * Initialize Fear & Greed badge responsive positioning
 */
export function initFngBadgePosition() {
  function repositionFngBadge() {
    const badge = document.querySelector('.fng-side-status');
    if (!badge) return;

    if (window.innerWidth >= 800) {
      badge.style.left = '50%';
      badge.style.top = 'auto';
      badge.style.bottom = '20px';
      badge.style.transform = 'translateX(-50%)';
    } else {
      badge.style.left = '';
      badge.style.top = '';
      badge.style.bottom = '';
      badge.style.transform = '';
    }
  }

  // Initial positioning
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', repositionFngBadge);
  } else {
    repositionFngBadge();
  }

  // Reposition on resize
  window.addEventListener('resize', repositionFngBadge);
}
