# Put this project on GitHub and run it live

Upload the CONTENTS of this folder to a new private GitHub repository. Include package.json, pnpm-lock.yaml, app/, server/, public/, Dockerfile and the other source/config files. Do not upload .env, .localdata, node_modules or secrets. No GitHub repository or deployment has been created by this ZIP.

## Docker hosting requirements
Use a Docker-capable always-on server with a persistent disk. This app contains a Node background worker and SQLite; GitHub Pages and static-only hosting cannot run it. Keep one instance/replica, because independent workers can duplicate posts. Free hosts that sleep cannot guarantee continuous monitoring.

Build from the repository's Dockerfile. Mount a persistent writable volume at /data (owned by UID 1000). Route HTTPS traffic to container port 8080. Configure these host environment variables privately:

- ADMIN_USER: your chosen login name
- ADMIN_PASSWORD: a unique random password of at least 16 characters
- PUBLIC_URL: the exact public HTTPS URL, for example https://publisher.example.com
- PUBLISHER_HOSTED: true (Docker default)
- PUBLISHER_DATA_DIR: /data (Docker default)
- PORT: 8080 (Docker default)
- AUTO_START: false initially

The entire dashboard and API require HTTP Basic login in hosted mode. Use HTTPS, supplied by your host/reverse proxy. Do not expose HTTP publicly: Basic login credentials require TLS protection.

For your own Docker server: copy .env.example to .env, change login and PUBLIC_URL, then run `docker compose up -d --build`. Compose exposes port 8080 only on the server's loopback interface; configure your HTTPS reverse proxy for 127.0.0.1:8080. The named Docker volume persists the database and encryption key. Back up the whole volume privately, together.

## Enable live publishing
Open the assigned HTTPS URL and sign in. The initial workspace is DEMO with sample deliveries; it has not contacted your accounts.

1. Connections: save X bearer token and Telegram bot token. Give the bot Post Messages permission in each channel; verify connections.
2. Send Telegram test only if you want a real labelled broadcast.
3. Automation settings: select Live and Automatic. Save.
4. Start automation. By default the initial scan records a baseline, so only newer X posts publish.
5. After confirming live setup, set AUTO_START=true in your host and restart. Future restarts resume the saved mode automatically. Keep AUTO_START=false if you prefer manual startup after a restart.

A saved Telegram-only connection is insufficient for X monitoring. Official X API access is required and may have usage charges. Keep tokens out of GitHub. Existing CMC extension automation is separate; this server does not publish to CMC or Instagram.

## Checks and limitations
`pnpm test` checks the worker with mocked APIs. `pnpm run build:host` builds the standalone production dashboard. These checks do not verify your real account credentials, the host's outbound connectivity or successful public delivery. Test a real post after deployment.

Delivery history, duplicate checks, review previews, captions and multiple Telegram channels are supported. Unknown Telegram outcomes require checking the actual channel before retrying. Restart recovery marks interrupted sends uncertain. Duplicate checks cannot provide an absolute exactly-once guarantee across a network failure.
