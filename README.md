# bittensor-labs

Bittensor-Labs ultra-compact Dashboard

## Overview
Started: November 3, 2025

This project provides a compact dashboard for visualizing and monitoring key Bittensor metrics. It is designed for anyone interested in understanding the Bittensor ecosystem. 

First it was just a learning and hobby project, but now it is passion.
PS: This is my first ever GitHub and website project, with many headaches but also much fun.

## Features

- Clear display of network statistics
- Node status and performance overview
- Real-time updates of important metrics / price
- Easily extendable and customizable

## Installation

```bash
git clone https://github.com/your-username/bittensor-labs.git
cd bittensor-labs
npm install
```

## Usage

```bash
npm run start
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Contributing

Pull requests and issues are welcome! Please follow the guidelines in CONTRIBUTING.md.

## CI & Releases

- The Release Drafter action used in this repository requires a GitHub secret named `GH_TOKEN` that has write permissions for releases and pull requests. Add it in the repository Settings → Secrets.
- The Smoke Test workflow (`.github/workflows/smoke-test.yml`) can be triggered manually from Actions (workflow_dispatch). It accepts inputs:
	- `url`: the Network API URL to validate (defaults to production API)
	- `skip_cloudflare_check`: `true` or `false`. When `true`, Cloudflare challenge pages will be treated leniently and skip the JSON validation step (useful for manual or ephemeral environments).
- For debugging in the client, set `window._debug = true` in the browser console to get debug logs about halving calculation and fallback behavior.

## License

MIT License

## Contact

For questions or feedback, please open an [Issue](https://github.com/maxim91136/bittensor-labs/issues) or submit a Pull Request on GitHub.

## Disclaimer & Data Sources

This dashboard is an independent, community-run project provided for informational purposes only and is not affiliated with, endorsed by, or certified by the Opentensor Foundation.

- Primary data is acquired on-chain via the repository's network API (`/api/network`).
- Price and supplementary supply metrics may be provided by third-party services (e.g. Taostats, CoinGecko) as fallbacks; these can be subject to rate limits and may not always be real-time.
- This project is not financial, legal, or investment advice. Always verify critical information using authoritative sources and consult a professional before acting on any data shown here.
- All data is provided "as-is" without warranty of any kind; the project maintainer disclaims liability for losses resulting from the use of this site.
- This site uses Cloudflare for security and performance; personal data is not stored by the project unless explicitly submitted by you.
- "Bittensor", "TAO" and other asset names are trademarks of their respective owners and are used for identification only.
