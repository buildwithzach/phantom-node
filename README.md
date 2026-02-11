This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

**Sniper Elite v23** — USD/JPY quant algo trader with a live command-center dashboard (prices, chart, economic calendar, trade history, algo status).

## Getting Started

**Unified launch:** one command starts both the Next.js app and the USD/JPY algo trader:

```bash
npm run dev
```

This runs the Next.js dev server and the Python algo (`python_algo/main.py`) via [concurrently](https://github.com/open-cli-tools/concurrently). Both must run together for the command center to work.

- **Requirements:** Node 18+, Python 3.x, Docker.
- **API Keys:** You need keys for [OANDA](https://www.oanda.com) (trading), [FMP](https://site.financialmodelingprep.com) (news), and [FRED](https://fred.stlouisfed.org) (macro data).
- **Setup:** Copy `.env.example` to `.env.local` and fill in your keys.
- **Optional:** run only the app or only the algo: `npm run dev:next` or `npm run dev:algo`.

Open [http://localhost:3000](http://localhost:3000) to use the command center. The **Algo Trader** strip shows live status (running/idle, last scan, last signal); the chart displays the latest signal and trade history from OANDA.

### Docker (run on its own system)

**You do not need a big system.** The stack is lightweight: Next.js + a small Python algo (pandas/numpy, ~800 candles, 60s loop). No database, no heavy compute.

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 1 vCPU | 1 vCPU |
| RAM | 512 MB | 1 GB |
| Disk | ~1 GB | ~2 GB |

A small VPS (e.g. 1 vCPU / 1 GB RAM) or a Raspberry Pi 4 is enough.

**Build and run:**

```bash
# With docker-compose (uses .env.local for OANDA keys)
docker compose up -d --build

# Or plain Docker
docker build -t sniper-elite .
docker run -p 3000:3000 --env-file .env.local sniper-elite
```

Ensure `.env.local` is set up (see above) with all required API keys. The container runs both the Next app and the algo; the dashboard is at [http://localhost:3000](http://localhost:3000). The host only needs Docker—no Node or Python installed.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
