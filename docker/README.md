# BTP Status — Docker Image

A self-contained Docker image for **BTP Status** based on Node.js 22.  
It clones the latest code from GitHub at build time, installs all dependencies
(including Playwright's Chromium for `browser-ias-login` endpoints), and starts
the Express server.

## What's inside

| Component | Source |
|-----------|--------|
| Node.js 22 | `node:22` (Debian Bookworm) |
| BTP Status app | `git clone https://github.com/sap-pilot/btp-status` at build time |
| Chromium | Downloaded by `playwright install --with-deps chromium` — exact version pinned by the Playwright release in `package.json` |
| OS libs | All Chromium system libraries (`libatk`, `libgbm`, `libnss3`, `libxkbcommon`, …) installed automatically by Playwright |
| SSH server | `openssh-server` — required for `cf ssh` access on Cloud Foundry |

---

## Prerequisites

- Docker 24+
- A container registry account (Docker Hub, GitHub Container Registry, SAP BTP Container Registry, etc.)

---

## Build

```bash
# From the repo root
docker build -f docker/Dockerfile -t btp-status:latest .

# Or from inside the docker/ folder
cd docker
docker build -t btp-status:latest .
```

The build clones the app from GitHub, so no local source copy is embedded —
rebuild the image to pick up new commits.

To pin a specific release instead of latest `main`, edit the `RUN git clone …`
line in the Dockerfile:

```dockerfile
RUN git clone --branch v0.3.0 --depth 1 https://github.com/sap-pilot/btp-status /app
```

---

## Publish

Tag and push to your registry of choice.

**Docker Hub**

```bash
docker tag btp-status:latest <your-dockerhub-username>/btp-status:0.3.0
docker tag btp-status:latest <your-dockerhub-username>/btp-status:latest
docker push <your-dockerhub-username>/btp-status:0.3.0
docker push <your-dockerhub-username>/btp-status:latest
```

**GitHub Container Registry**

```bash
echo $GITHUB_PAT | docker login ghcr.io -u <your-github-username> --password-stdin
docker tag btp-status:latest ghcr.io/<your-github-org>/btp-status:0.3.0
docker push ghcr.io/<your-github-org>/btp-status:0.3.0
```

---

## Run locally

```bash
docker run --rm \
  -p 3000:3000 \
  -e PORT=3000 \
  -e CONFIG_JSON='{"services":[...]}' \
  -v "$(pwd)/response:/app/response" \
  btp-status:latest
```

Open http://localhost:3000/overview

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP listen port (Cloud Foundry sets this automatically) |
| `CONFIG_JSON` | — | Full config as a JSON string (takes priority over `CONFIG_FILE`) |
| `CONFIG_FILE` | `./config.json` | Path to config file inside the container |
| `RESPONSE_DIR` | `./response` | Directory for response file storage |
| `SYNC_REMOTE` | — | Base URL of another BTP Status instance to sync history files from |
| `SYNC_INTERVAL` | `900` | Seconds between periodic remote sync runs |
| `LOG_LEVEL` | `debug` | Pino log level: `trace` `debug` `info` `warn` `error` |

---

## Deploy on SAP BTP Cloud Foundry (MTA)

Replace the `docker.image` value in `mta.yaml` with your published image:

```yaml
modules:
  - name: btp-status-srv
    type: nodejs
    path: server
    parameters:
      docker:
        image: <your-dockerhub-username>/btp-status:0.3.0   # ← your image here
      memory: 1G
      disk-quota: 2G
      enable-ssh: true
      keep-existing:
        env: true
```

Then build and deploy as usual:

```bash
mbt build
cf deploy mta_archives/btp-status_0.3.0.mtar -f --retries 1 \
  --strategy blue-green --skip-testing-phase
```

> **Why 1G memory?**  Playwright launches a full Chromium process per browser check.
> 256 MB is not enough; 1 GB comfortably handles concurrent checks.

### CF SSH

`enable-ssh: true` in `mta.yaml` enables `cf ssh btp-status-srv`.
The image includes `openssh-server` as required by the Cloud Foundry Docker SSH
specification.

### PORT binding

Cloud Foundry injects `PORT` as an environment variable at runtime.
The Express server reads `process.env.PORT` and binds to it — no manual
configuration needed.

---

## Notes

- The Docker image bundles the Playwright-managed Chromium binary (not the system
  Chrome).  The `--no-sandbox` / `--disable-setuid-sandbox` flags are set in the
  application code so Chromium can run inside a container as root.
- Response files written to `RESPONSE_DIR` inside the container are ephemeral
  unless you mount a persistent volume or enable `SYNC_REMOTE`.
- Rebuilding the image always fetches the latest `main` branch.  Pin a Git tag in
  the Dockerfile for reproducible production images.
