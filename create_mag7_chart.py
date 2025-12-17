#!/usr/bin/env python3
"""Generate Mag 7 Portfolio Chart - UPDATED WITH CURRENT DATA"""

import matplotlib.pyplot as plt

# CORRECTED DATA (Dec 17, 2025) - from taostats screenshot
subnets = [
    'Affine (120)',
    'Chutes (64)',
    'Vanta (8)',
    'Ridges (62)',
    'Targon (4)',
    'Lium (51)',
    'Templar (3)'
]
emissions = [236.1, 232.0, 156.4, 153.4, 128.2, 125.5, 89.8]

# Color gradient (blue shades)
colors = ['#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe']

fig, ax = plt.subplots(figsize=(14, 8), facecolor='#0a0a0a')
ax.set_facecolor('#1a1a1a')

# Horizontal bars
bars = ax.barh(subnets, emissions, color=colors, edgecolor='#ffffff', linewidth=2, height=0.7)

# Title
ax.set_title('The "Mag 7" Bittensor Subnet Portfolio',
             fontsize=26, color='#ffffff', fontweight='bold', pad=30,
             fontfamily='sans-serif')

# X-axis label
ax.set_xlabel('Daily Emissions (τ/day)', fontsize=16, color='#ffffff',
              fontweight='bold', labelpad=15)

# Add emission values on bars
for i, (bar, emission) in enumerate(zip(bars, emissions)):
    ax.text(emission + 8, i, f'{emission:.1f} τ',
            va='center', fontsize=13, color='#ffffff', fontweight='bold')

# Total emissions
total = sum(emissions)
ax.text(0.98, 0.95, f'Total: ~{total:.0f} τ/day',
        transform=ax.transAxes, fontsize=15, color='#fbbf24',
        ha='right', va='top', fontweight='bold',
        bbox=dict(boxstyle='round,pad=0.5', facecolor='#1a1a1a',
                  edgecolor='#fbbf24', linewidth=2))

# Grid
ax.grid(axis='x', alpha=0.15, color='#ffffff', linestyle='--', linewidth=0.5)
ax.set_xlim(0, max(emissions) + 60)

# Styling
ax.tick_params(colors='#ffffff', labelsize=12, width=2)
ax.spines['bottom'].set_color('#ffffff')
ax.spines['left'].set_color('#ffffff')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['bottom'].set_linewidth(2)
ax.spines['left'].set_linewidth(2)

# Y-axis labels
ax.tick_params(axis='y', labelsize=13)

plt.tight_layout()
output_path = '/Users/steve/Documents/bittensor-hub/BITTENSOR-HUB/bittensor-labs/mag7_portfolio_UPDATED.png'
plt.savefig(output_path, dpi=300, facecolor='#0a0a0a', bbox_inches='tight')
print(f"✅ UPDATED Chart saved to: {output_path}")
print(f"Total: {total:.1f} τ/day")
