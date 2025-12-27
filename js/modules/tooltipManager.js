// ===== Tooltip Manager Module (ES6) =====
// Modern tooltip system for info-badges and pills

// Auto-hide duration for non-persistent tooltips
const TOOLTIP_AUTO_HIDE_MS = 5000;

/**
 * Modern Tooltip Manager
 * Handles positioning, show/hide, and accessibility
 */
class TooltipManager {
  constructor() {
    this.tooltip = null;
    this.currentTarget = null;
    this.hideTimer = null;
    this.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    this.init();
  }

  init() {
    // Create tooltip element
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'modern-tooltip';
    this.tooltip.setAttribute('role', 'tooltip');
    this.tooltip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.tooltip);

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!this.tooltip.contains(e.target) && this.currentTarget && !this.currentTarget.contains(e.target)) {
        this.hide();
      }
    });

    // Close on ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.tooltip.classList.contains('visible')) {
        this.hide();
      }
    });
  }

  show(target, options = {}) {
    const {
      text = '',
      html = false,
      persistent = false,
      autoHide = 4000,
      wide = false
    } = options;

    // Clear any existing timer
    this.clearTimer();

    // If clicking same target, toggle off
    if (this.currentTarget === target && this.tooltip.classList.contains('visible')) {
      this.hide();
      return;
    }

    // Update current target
    this.currentTarget = target;

    // Build content
    this.tooltip.innerHTML = '';

    const body = document.createElement('div');
    body.className = 'tooltip-body';
    if (html) {
      body.innerHTML = text;
    } else {
      body.textContent = text;
    }
    this.tooltip.appendChild(body);

    // Add close button if persistent or touch
    if (persistent || this.isTouch) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'tooltip-close';
      closeBtn.innerHTML = '&times;';
      closeBtn.setAttribute('aria-label', 'Close tooltip');
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hide();
      });
      this.tooltip.appendChild(closeBtn);
      this.tooltip.classList.add('has-close');
    } else {
      this.tooltip.classList.remove('has-close');
    }

    // Wide variant
    if (wide) {
      this.tooltip.classList.add('wide');
    } else {
      this.tooltip.classList.remove('wide');
    }

    // Show tooltip
    this.tooltip.classList.add('visible');
    this.tooltip.setAttribute('aria-hidden', 'false');

    // Position tooltip
    this.position(target);

    // Auto-hide timer (unless persistent)
    if (!persistent && autoHide > 0) {
      this.hideTimer = setTimeout(() => this.hide(), autoHide);
    }
  }

  position(target) {
    // Get rects
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const padding = 8;
    const arrowOffset = 6;

    let top, left;

    // Always position below (consistent UX) - only flip if truly no space
    top = targetRect.bottom + arrowOffset + padding;
    this.tooltip.dataset.position = 'bottom';

    // Only flip to top if tooltip would go off-screen at bottom
    if (top + tooltipRect.height > window.innerHeight - padding) {
      const topPosition = targetRect.top - tooltipRect.height - arrowOffset - padding;
      // Only use top if it actually fits better
      if (topPosition >= padding) {
        top = topPosition;
        this.tooltip.dataset.position = 'top';
      }
    }

    // Position horizontally (centered on target)
    left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

    // Keep within viewport horizontally
    if (left < padding) {
      left = padding;
    }
    if (left + tooltipRect.width > window.innerWidth - padding) {
      left = window.innerWidth - tooltipRect.width - padding;
    }

    // Apply position
    this.tooltip.style.top = `${top}px`;
    this.tooltip.style.left = `${left}px`;
  }

  hide() {
    this.clearTimer();
    this.tooltip.classList.remove('visible');
    this.tooltip.setAttribute('aria-hidden', 'true');
    this.currentTarget = null;
  }

  clearTimer() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}

// Module-level tooltip manager instance
let _tooltipManager = null;

/**
 * Get or create the tooltip manager instance
 * @returns {TooltipManager}
 */
export function getTooltipManager() {
  if (!_tooltipManager) {
    _tooltipManager = new TooltipManager();
  }
  return _tooltipManager;
}

/**
 * Setup dynamic tooltips for info-badges and pills
 * @param {Object} options - Options for tooltip setup
 * @param {Object} options.MatrixSound - MatrixSound instance for audio feedback
 */
export function setupDynamicTooltips(options = {}) {
  const { MatrixSound = window.MatrixSound } = options;
  const tooltipManager = getTooltipManager();
  const isTouch = tooltipManager.isTouch;

  // Info badges - always persistent with X-button (Desktop & Mobile)
  document.querySelectorAll('.info-badge').forEach(badge => {
    if (badge.closest && badge.closest('.taotensor-card')) return;

    // Hover on desktop shows tooltip without X-button (persistent behavior, no auto-hide)
    if (!isTouch) {
      badge.addEventListener('mouseenter', () => {
        const text = badge.getAttribute('data-tooltip');
        const html = badge.getAttribute('data-tooltip-html') === 'true';
        if (text) tooltipManager.show(badge, { text, html, persistent: false, autoHide: 0 });
      });
      badge.addEventListener('mouseleave', () => tooltipManager.hide());
    }

    // Keyboard navigation
    badge.addEventListener('focus', () => {
      const text = badge.getAttribute('data-tooltip');
      const html = badge.getAttribute('data-tooltip-html') === 'true';
      if (text) tooltipManager.show(badge, { text, html, persistent: true, autoHide: 0 });
    });

    // Click on mobile/touch
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = badge.getAttribute('data-tooltip');
      const html = badge.getAttribute('data-tooltip-html') === 'true';
      if (text) {
        tooltipManager.show(badge, { text, html, persistent: true, autoHide: 0 });
      }
    });
  });

  // Halving pills (wide tooltips)
  document.querySelectorAll('.halving-pill').forEach(pill => {
    if (!isTouch) {
      pill.addEventListener('mouseenter', () => {
        const text = pill.getAttribute('data-tooltip') || '';
        const html = pill.getAttribute('data-tooltip-html') === 'true';
        if (text) tooltipManager.show(pill, { text, html, wide: true, persistent: false, autoHide: 0 });
      });
      pill.addEventListener('mouseleave', () => tooltipManager.hide());
    }

    // Keyboard navigation
    pill.addEventListener('focus', () => {
      const text = pill.getAttribute('data-tooltip') || '';
      const html = pill.getAttribute('data-tooltip-html') === 'true';
      if (text) tooltipManager.show(pill, { text, html, wide: true, persistent: false, autoHide: 0 });
    });
    pill.addEventListener('blur', () => tooltipManager.hide());

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      if (MatrixSound?.play) MatrixSound.play('halving-click');
      const text = pill.getAttribute('data-tooltip') || '';
      const html = pill.getAttribute('data-tooltip-html') === 'true';
      if (text) {
        tooltipManager.show(pill, {
          text,
          html,
          wide: true,
          persistent: isTouch,
          autoHide: isTouch ? 0 : TOOLTIP_AUTO_HIDE_MS
        });
      }
    });
  });

  // Price pills
  document.querySelectorAll('.price-pill').forEach(pill => {
    if (!isTouch) {
      pill.addEventListener('mouseenter', () => {
        const text = pill.getAttribute('data-tooltip') || '';
        const html = pill.getAttribute('data-tooltip-html') === 'true';
        if (text) tooltipManager.show(pill, { text, html, persistent: false, autoHide: 0 });
      });
      pill.addEventListener('mouseleave', () => tooltipManager.hide());
    }

    // Keyboard navigation
    pill.addEventListener('focus', () => {
      const text = pill.getAttribute('data-tooltip') || '';
      const html = pill.getAttribute('data-tooltip-html') === 'true';
      if (text) tooltipManager.show(pill, { text, html, persistent: false, autoHide: 0 });
    });
    pill.addEventListener('blur', () => tooltipManager.hide());

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      if (MatrixSound?.play) MatrixSound.play('pill-click');
      const text = pill.getAttribute('data-tooltip') || '';
      const html = pill.getAttribute('data-tooltip-html') === 'true';
      if (text) {
        tooltipManager.show(pill, {
          text,
          html,
          persistent: isTouch,
          autoHide: isTouch ? 0 : TOOLTIP_AUTO_HIDE_MS
        });
      }
    });
  });
}
