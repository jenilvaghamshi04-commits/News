# Fix the existing News Render service

The source code lives at the repository root, not in a bitcoinworld-publisher subdirectory. The Dockerfile has a capital D.

In the existing Render web service's Settings → Build & Deploy, use:

| Setting | Value |
|---|---|
| Repository | https://github.com/jenilvaghamshi04-commits/News |
| Branch | main |
| Root Directory | Empty (repository root) |
| Runtime / Language | Docker |
| Dockerfile Path | ./Dockerfile |
| Docker Build Context Directory | . |
| Docker Command | Empty (uses image CMD) |
| Health Check Path | /healthz |

Save, then use Manual Deploy → Clear build cache & deploy. A Dockerfile-not-found error occurs before dependency installation; changing application code alone cannot repair an incorrect service path setting.

Environment:
- ADMIN_USER: choose your dashboard login name
- ADMIN_PASSWORD: a unique random password, at least 16 characters
- PUBLISHER_HOSTED: true (already in Docker image)
- PUBLISHER_DATA_DIR: /data (already in Docker image)
- AUTO_START: false for initial setup
- PUBLIC_URL: optional on Render, where RENDER_EXTERNAL_URL is provided automatically; set it to your HTTPS URL if you use a custom domain instead

Keep credentials in Render Environment, never GitHub. The public /healthz route returns only {"ok":true}; the dashboard and data API still require login.

For durable operation, use one instance with a persistent disk mounted at /data, writable by UID 1000. Render disks require a paid service; no paid service or disk is created by this repository. Without a persistent disk, settings, secrets and duplicate history can disappear on redeploy/restart. Free services can sleep, so do not rely on them for uninterrupted publishing.

Once deployed, sign in using the normal HTML login page. The hosted app opens in Live setup. Connect X and Telegram in Connections, save, click Verify & enable live mode, then start automation. Initial X scan defaults to a baseline: older posts are not automatically sent. With AUTO_START unset, an explicitly started worker resumes on later restarts from persistent data. Pause disables resume. AUTO_START=false overrides this and always requires manual startup.
