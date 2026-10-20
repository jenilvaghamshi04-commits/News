# BitcoinWorld Publisher

**Going live from GitHub? Start with [DEPLOY.md](DEPLOY.md).** Includes production Docker deployment, dashboard login, persistent data and optional startup after server restarts.

# BitcoinWorld Publisher — local app

## Run on your computer
Install Node.js 24 LTS and pnpm 11, then open a terminal in this folder:

```sh
pnpm install
pnpm dev
```

Open **http://localhost:4173**. Keep the terminal and computer running. Closing the dashboard tab does not stop the worker. Ctrl+C stops the service. Run `pnpm test` for the backend checks.

The app starts in DEMO mode. No external publishing occurs until you deliberately configure live credentials or confirm a Telegram test. Sample deliveries are labelled as demo.

## Connect live accounts
1. Connections: save your X API bearer token and Telegram BotFather token. Add the bot as admin with Post Messages permission in @News982192 (or your configured channels).
2. Verify both saved connections. A Telegram test posts a real labelled test message after confirmation.
3. Automation settings: select Live and Automatic, then save while paused.
4. Start automation. The first scan saves a baseline by default; only newer X posts publish. Fetch latest preview lets you select an existing post.

Features: text, photos, videos and GIFs; caption rules; manual review; multiple public Telegram channels; per-channel history; caption duplicate protection; explicit retries. Unsupported or oversized source media falls back to a source-post link. Long captions continue as messages. X API access is required and may cost money; no free API entitlement is included.

Unknown delivery responses are held for verification rather than retried automatically. Check Telegram before retrying them. A partially accepted delivery can repeat earlier parts if you retry it.

Data and encrypted credentials live in .localdata/. Back up that entire folder including secrets.key together; keep it private. The server starts paused after each restart.

CoinMarketCap and Instagram are not connected in this local server version. The previous CMC extension remains separate.

This is a local dashboard, without internet-facing authentication. Do not expose its ports publicly. Publishing while your computer is off requires an always-on deployment and proper access control. A normal website alone does not provide that background worker.
