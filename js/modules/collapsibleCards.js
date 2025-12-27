// ===== Collapsible Cards Module =====
// Allows dashboard cards to be collapsed on mobile to reduce scroll

const COLLAPSED_KEY = 'dashboard_collapsed_cards';
const MOBILE_BREAKPOINT = 768;

function getCollapsedCards() {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveCollapsedCards(cards) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(cards));
  } catch (e) {
    // localStorage might be unavailable
  }
}

function isMobile() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

export function initCollapsibleCards() {
  // Only initialize on mobile/tablet
  if (!isMobile()) return;

  const collapsibleCards = document.querySelectorAll('.dashboard-card[data-collapsible]');
  const collapsedCards = getCollapsedCards();

  collapsibleCards.forEach(card => {
    const cardId = card.id || card.getAttribute('data-card-id');
    const header = card.querySelector('.card-header');
    if (!header || !cardId) return;

    // Check if toggle already exists (avoid duplicates on re-init)
    if (header.querySelector('.collapse-toggle')) return;

    // Create collapse toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'collapse-toggle';
    toggleBtn.setAttribute('aria-label', 'Toggle section');
    toggleBtn.innerHTML = '<span class="collapse-icon">−</span>';
    header.appendChild(toggleBtn);

    // Apply saved collapsed state
    if (collapsedCards.includes(cardId)) {
      card.classList.add('collapsed');
      toggleBtn.querySelector('.collapse-icon').textContent = '+';
    }

    // Toggle handler
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isCollapsed = card.classList.toggle('collapsed');
      toggleBtn.querySelector('.collapse-icon').textContent = isCollapsed ? '+' : '−';

      // Update localStorage
      const cards = getCollapsedCards();
      if (isCollapsed) {
        if (!cards.includes(cardId)) cards.push(cardId);
      } else {
        const idx = cards.indexOf(cardId);
        if (idx >= 0) cards.splice(idx, 1);
      }
      saveCollapsedCards(cards);
    });

    // Also allow clicking the header to toggle (except on interactive elements)
    header.addEventListener('click', (e) => {
      // Don't toggle if clicking on buttons, links, or inputs
      if (e.target.closest('button, a, input, select, .info-badge')) return;
      toggleBtn.click();
    });
  });
}

// Re-check on resize (enable/disable based on viewport)
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (isMobile()) {
      initCollapsibleCards();
    } else {
      // Remove collapsed state on desktop
      document.querySelectorAll('.dashboard-card.collapsed').forEach(card => {
        card.classList.remove('collapsed');
      });
    }
  }, 250);
});
