# BTP Service Status

A lightweight, file-backed status page and health checker for SAP BTP services. Compatible with Azure Traffic Manager's HTTP probe mechanism and provides a Gatus-style admin dashboard for reviewing availability history.

![BTP Status Dashboard](doc/img/btp-status-compare.png)

## Features

- **Service mode control** — per-service mode selector (Enabled / Unavailable / Disabled) on the detail page; mode overrides affect `/health/:name` responses and the background scheduler without restarting the server
- **HTTP health checks** with Gatus-style condition evaluation (`[STATUS]`, `[BODY]`, `[HEADER.*]`, `[RESPONSE_TIME]`, `len()`, `pat()`)
- **Browser-based IAS login check** (`mode: browser-ias-login`) — headless Chromium fills the SAP IAS login form, waits for a CSS selector to appear (`waitForSelector`), captures a screenshot; the screenshot is stored alongside the JSON record, shown in the history detail modal and the Test popup
- **Azure Traffic Manager integration** — `GET /health/:name` returns `200 OK` when all conditions pass, `500` with failure details when any condition fails
- **Gatus-style overview dashboard** at `/overview` — services grouped by group name with colored status timeline dots; clicking any dot navigates to the service detail page and opens the response modal for that check
- **Per-service detail** at `/service/:name` — uptime %, avg response time, full check history table, response time line chart per endpoint; clicking any timeline dot opens the response detail modal for that check directly
- **Drill-down modal** — inspect every request/response/condition result for any past check
- **File-based storage** — no database required; responses saved as JSON files under `./response/`
- **Dark-themed React UI** built with shadcn/ui + Tailwind CSS
- **SAP BTP Cloud Foundry deployment** via MTA (`mta.yaml`)

## Condition Syntax

Conditions follow [Gatus](https://github.com/TwiN/gatus#conditions) syntax:

| Condition | Description | Example |
|-----------|-------------|---------|
| `[STATUS] == 200` | HTTP status code | `[STATUS] == 301` |
| `[RESPONSE_TIME] < 500` | Response time in ms | `[RESPONSE_TIME] < 2000` |
| `[BODY] == "text"` | Body equals string | `[BODY] == "OK"` |
| `[BODY].key == "value"` | JSON body field (dot-path) | `[BODY].status == "healthy"` |
| `[HEADER.name] == "value"` | Response header value | `[HEADER.content-type] == "application/json"` |
| `len([BODY].arr) > 0` | Array/object length | `len([BODY].items) > 0` |
| `[BODY] == pat(*glob*)` | Glob/regex pattern match | `[BODY] == pat(*authentication*)` |

Operators: `==`, `!=`, `<`, `>`, `<=`, `>=`

## Quick Start

### Prerequisites

- Node.js 20+
- npm 9+

### Development

```bash
# 1. Install dependencies
npm install

# 2. Copy sample config into the server folder and edit
cp config-sample.json server/config.json
# Edit server/config.json with your real service endpoints

# 3. Build client once, then start Express (serves UI + API on :3000)
npm run dev
```

Open http://localhost:3000/overview

When iterating on the frontend, rebuild the client in a second terminal while the server keeps running:

```bash
# Terminal 1 — Express with auto-restart on server file changes
npm run dev:server

# Terminal 2 — Vite rebuild on every client file change
npm run watch:client
```

### Production Build

```bash
npm run build   # builds React → server/public/, then compiles server TypeScript
npm start       # runs Express on PORT (default 3000)
```

Open http://localhost:3000/overview

## Configuration

The server resolves configuration in this priority order:

1. **`CONFIG_JSON` env var** — JSON string with the full config (useful for BTP env properties, no file needed)
2. **`CONFIG_FILE` env var / default** — path to a JSON file (default: `./config.json` relative to the `server/` working directory, i.e. `server/config.json` from the repo root)

Create `server/config.json` (based on `config-sample.json`):

```json
{
  "services": [
    {
      "group": "WorkZone",
      "name": "my-service",
      "enabled": true,
      "endpoints": [
        {
          "name": "Health Check",
          "url": "https://my-service.example.com/health",
          "method": "GET",
          "headers": {
            "Accept": "application/json"
          },
          "body": null,
          "conditions": [
            "[STATUS] == 200",
            "[RESPONSE_TIME] < 3000",
            "[BODY].status == \"healthy\""
          ]
        }
      ]
    }
  ]
}
```

### Config Fields

| Field | Type | Description |
|-------|------|-------------|
| `group` | string | Group name for dashboard grouping |
| `name` | string | Unique service identifier (used in URLs) |
| `enabled` | boolean | Set `false` to exclude from checks |
| `interval` | number | Auto-check interval in seconds; `0` or omitted disables automatic checks |
| `homepage` | string | Optional homepage URL; when set, an ↗ button appears next to the service name on the dashboard and opens the URL in a new tab |
| `endpoints[].name` | string | Display name for this endpoint |
| `endpoints[].url` | string | URL to probe |
| `endpoints[].method` | string | HTTP method (`GET`, `POST`, etc.) |
| `endpoints[].headers` | object | Request headers (key-value pairs) |
| `endpoints[].body` | string\|null | Request body (JSON string or null) |
| `endpoints[].conditions` | string[] | Conditions to validate (Gatus syntax) |
| `endpoints[].mode` | string | `browser-ias-login` to use headless Chromium instead of an HTTP request |
| `endpoints[].username` | string | IAS username (browser-ias-login only) |
| `endpoints[].password` | string | IAS password (browser-ias-login only) |
| `endpoints[].waitForSelector` | string | CSS selector to wait for after login (browser-ias-login only) |
| `endpoints[].timeout` | number | Overall browser session timeout in ms (default `30000`; browser-ias-login only) |

### Browser-based IAS Login Check

Set `mode: "browser-ias-login"` on an endpoint to use a headless Chromium session instead of a plain HTTP request:

```json
{
  "mode": "browser-ias-login",
  "name": "Workzone Login",
  "url": "https://<tenant>.launchpad.cfapps.<region>.hana.ondemand.com/site/<site>?sap_idp=<idp>",
  "username": "monitor@example.com",
  "password": "secret",
  "waitForSelector": "#shellAppTitle",
  "timeout": 30000
}
```

The check flow:
1. Launch headless Chromium, navigate to `url` (which triggers the IAS redirect)
2. Fill `#j_username`, click `#next-button`
3. Fill `#j_password`, click `#logOnFormSubmit`
4. Wait for the CSS selector `waitForSelector` to appear in the DOM — success if found before `timeout`, failure otherwise
5. Capture a screenshot regardless of outcome
6. Save screenshot as `yyyyMMdd-HHmmss_{endpointSlug}_{city}_{ms}_{status}.png` alongside the JSON record

The screenshot appears in:
- `/api/browse` and `/api/download` (same folder as JSON records)
- The **Screenshot** tab when clicking a history row on the Service detail page
- The **Test** popup after "Run Test" or "Test all"

> **Chromium setup (local dev)**: run `npx playwright install chromium` once after `npm install`.  
> On SAP BTP Cloud Foundry, Google Chrome is installed automatically via the apt-buildpack — no manual step required (see [BTP deployment notes](#deployment-sap-btp-mta)).

### Automatic Checks

When `interval` is set to a value greater than `0`, the server automatically runs a health check for that service every `interval` seconds — no external scheduler or cron job required.

- If a check is already running when the next interval fires, that tick is **skipped** (no pile-up).
- Errors inside a check are caught and logged; the timer continues unaffected.
- All timers are released with `unref()` so they do not block graceful process shutdown.
- On `SIGTERM` / `SIGINT` the scheduler stops cleanly before the HTTP server closes.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health/:name` | Run health check; returns `200 OK` or `500 <failure details>` (Azure Traffic Manager) |
| `GET /overview` | Overview dashboard UI |
| `GET /service/:name` | Service detail UI — history timeline, drill-down, "Run Test" button |
| `GET /api/services` | List all services (JSON) |
| `GET /api/check/:name` | Run health check, return structured JSON with per-endpoint request/response/conditions (used by Test popup) |
| `GET /api/overview?hours=24` | Overview data for all services (JSON) |
| `GET /api/history/:name?hours=24` | History file list for a service (JSON) |
| `GET /api/history/:name/:filename` | Full request/response detail for one check (JSON) |
| `GET /api/info` | Server capabilities: `{ syncRemote: boolean }` — used by the UI to conditionally show the Sync button |
| `GET /api/eval-mode/:name` | Current evaluation mode: `{ mode: "condition" \| "alwaysok" \| "alwayserror" }` |
| `POST /api/eval-mode/:name` | Set evaluation mode (JSON body `{ "mode": "..." }`); resets to `condition` on server restart |
| `GET /api/schedule/:name` | Current effective interval in seconds: `{ intervalSeconds }` |
| `POST /api/schedule/:name` | Set schedule override (JSON body `{ "intervalSeconds": N }`); `0` disables autorun; resets on server restart |
| `POST /api/sync` | Trigger an on-demand remote sync; returns `{ ok, files, transferredMB, decompressedMB, elapsedSec }` or `{ ok: false, busy: true }` if a sync is already running |
| `GET /api/browse` | List all response files grouped by service folder: `{ folders: { name: [filename, ...] } }` |
| `GET /api/download?path=folder/file.json` | Download a single response file (path restricted to `response/` directory) |

### Evaluation Mode & Schedule

On any service's detail page (`/service/:name`), two selectors in the header control the service without restarting the server:

**Evaluation Mode** — how check results are interpreted:

| Mode | `/health/:name` | Saved status | Timeline dot |
|------|----------------|-------------|--------------|
| **Condition Based** (green, default) | `200`/`500` based on actual conditions | `200` or `500` | Green / Red |
| **Always OK** (dark green) | Always `200 OK` regardless of conditions | `203` | Dark green |
| **Always Error** (dark red) | Always `500` regardless of conditions | `503` | Dark red |

A confirmation dialog appears before applying Always OK or Always Error. Both modes honour the evaluation setting for all execution paths (scheduled checks, manual `/health/:name`, Run Test).

**Schedule** — auto-run interval:

| Option | Effect |
|--------|--------|
| Every 5 / 10 / 15 / 30 min / 1 hour | Reschedules the service immediately; overrides `config.json` interval |
| Disable autorun | Stops scheduled checks; only manual `/health/:name` or Run Test will record results |

All overrides are in-memory and reset to their `config.json` defaults on server restart.

### Azure Traffic Manager

Point your Traffic Manager HTTP probe at:

```
GET https://<your-app>/health/<service-name>
```

- Returns `200 OK` (plain text) → endpoint is healthy
- Returns `500` (plain text with failure details) → endpoint is unhealthy

## Response File Storage

Each health check saves a file at:

```
./response/{service-name}/yyyyMMdd-HHmmss_{endpointSlug}_{city}_{responseTimeMs}_{200|203|500|503}.json
```

- **Timestamp**: UTC (`yyyyMMdd-HHmmss`)
- **endpointSlug**: endpoint `name` from config with non-alphanumeric chars replaced by dashes
- **city**: full city name from `ip-api.com` with spaces replaced by dashes (e.g. `Frankfurt-am-Main`); resolved once at startup; `unknown` if lookup fails or times out
- **responseTimeMs**: integer milliseconds, no suffix
- **Status codes**: `200` = genuine pass, `203` = pass under Always OK, `500` = genuine fail, `503` = fail under Always Error

Old-format files (`yyyyMMdd-HHmmss_{index}_{ms}ms_{status}.json`, local-timezone timestamp) are still read and displayed correctly alongside new-format files.

File content:
```json
{
  "request": { "url": "...", "method": "GET", "headers": {}, "body": null },
  "response": { "status": 200, "headers": {}, "body": "..." },
  "timestamp": "2026-06-16T10:00:00.000Z",
  "responseTime": 342,
  "endpointIndex": 0,
  "endpointName": "Health Check",
  "conditions": [
    { "condition": "[STATUS] == 200", "passed": true, "actual": "200", "expected": "== 200" }
  ],
  "overallStatus": 200
}
```

## Logging

The server uses [pino](https://getpino.io) with colorized pretty-print output.

| Level | When |
|-------|------|
| `INFO` | Server startup · config source (file vs env var) · incoming `/health/:name` requests · pass/fail result · manual test trigger |
| `DEBUG` | Outgoing HTTP method + URL · response status, time, body preview (first 300 chars) |
| `WARN` | Each failed condition — shows actual vs expected value (yellow) |
| `ERROR` | Network/connection errors from fetch (red, full error object + stack) |

```
[10:02:31] INFO  (service=dcore-prod from=::1) Health check request received
[10:02:31] DEBUG (service=dcore-prod endpoint="Launch Redirect" method=GET url=https://…) Sending request
[10:02:32] DEBUG (service=dcore-prod endpoint="Launch Redirect" status=301 responseTime=743) Response received
[10:02:32] INFO  (service=dcore-prod) Health check passed
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP listen port (Cloud Foundry sets this automatically) |
| `CONFIG_JSON` | — | Full config as a JSON string; takes priority over `CONFIG_FILE` (ideal for BTP env properties) |
| `CONFIG_FILE` | `./config.json` | Path to config JSON file (relative to `server/` working dir; resolved as `server/config.json` from repo root) |
| `RESPONSE_DIR` | `./response` | Directory for response file storage |
| `SYNC_REMOTE` | — | Base URL of another BTP Status instance (e.g. `https://btp-status-prod.cfapps.eu10.hana.ondemand.com`). On startup, missing response files are downloaded in batches from the remote `/api/browse` + `/api/download` endpoints and saved to the local `RESPONSE_DIR`. Periodic sync runs every `SYNC_INTERVAL` seconds. |
| `SYNC_INTERVAL` | `900` | Seconds between periodic remote sync runs (minimum 60). Only effective when `SYNC_REMOTE` is set. |
| `MAX_RESPONSE_STORAGE_DAYS` | `3` | Response files (JSON + PNG) older than this many days are automatically deleted. Housekeeping runs once on startup then every 24 hours. Set to `0` to disable. |
| `LOG_LEVEL` | `debug` | Pino log level: `trace`, `debug`, `info`, `warn`, `error` |

## Remote Sync

Set `SYNC_REMOTE` to the base URL of another running BTP Status instance to seed the local response directory on startup:

```bash
SYNC_REMOTE=https://btp-status-prod.cfapps.eu10.hana.ondemand.com npm start
```

On boot the server will:
1. Call `GET /api/browse` on the remote to get its full file list
2. Compare against the local `./response/` directory
3. Download all missing files in parallel batches of 10 via `GET /api/download?path=…`
4. Log each downloaded path at `DEBUG` level
5. Log total files, transferred MB, decompressed MB, and elapsed seconds at `INFO`

After the initial sync, the same logic runs again every `SYNC_INTERVAL` seconds (default `900` / 15 minutes) as a background job — keeping the local instance in sync with the remote over time. Files already present locally are never re-downloaded. The timer uses `unref()` so it does not prevent graceful shutdown.

## Gzip Compression

All HTTP responses — API JSON, HTML, CSS, JavaScript — are automatically gzip-compressed using native `node:zlib` when the client sends `Accept-Encoding: gzip`. Binary image types (JPEG, PNG, GIF, etc.) are passed through uncompressed. No additional dependency is required.

## Deployment (SAP BTP MTA)

### How it works

The app is packaged as an MTA archive and deployed to SAP BTP Cloud Foundry using two buildpacks in sequence:

1. **[apt-buildpack](https://github.com/cloudfoundry/apt-buildpack)** — reads `server/apt.yml` and installs the shared system libraries that Playwright's Chromium requires on the minimal `cflinuxfs4` stack (`libnss3`, `libatk1.0-0`, `libgbm1`, etc.).
2. **nodejs_buildpack** — installs production dependencies (Playwright's npm install hook downloads its self-contained Chromium binary at this point), compiles and runs the app.

This means no Docker image management is required. Playwright's bundled Chromium is downloaded during CF staging and is available when the app starts.

### Prerequisites

```bash
npm install -g mbt                  # Cloud MTA Build Tool
cf install-plugin multiapps         # CF MTA plugin (once per CF CLI install)
```

### Build & Deploy

```bash
# Log in
cf login -a https://api.cf.<region>.hana.ondemand.com
cf target -o <org> -s <space>
```

| Script | What it does |
|--------|-------------|
| `npm run bd` | Build MTA archive + standard deploy (full pipeline) |
| `npm run bd-bg` | Build MTA archive + blue-green deploy (full pipeline, zero-downtime) |
| `npm run deploy` | Standard deploy of an already-built `.mtar` (skips `mbt build`) |
| `npm run deploy-bg` | Blue-green deploy of an already-built `.mtar` (skips `mbt build`) |

```bash
# Full pipeline: build then deploy
npm run bd       # standard deploy
npm run bd-bg    # blue-green deploy (zero-downtime)

# Redeploy an existing archive without rebuilding
npm run deploy      # standard
npm run deploy-bg   # blue-green
```

**Blue-green strategy** (`--strategy blue-green --skip-testing-phase`) starts a parallel "green" instance, waits for it to be healthy, routes traffic to it, then removes the old "blue" instance — minimising downtime during deploys.

`keep-existing: env: true` in `mta.yaml` instructs the MTA deployer to **preserve existing environment variables** (e.g. `CONFIG_JSON`, `SYNC_REMOTE`) on the app during deployment, so runtime config set via `cf set-env` is not wiped by a redeploy.

### Post-deploy config

Two options for providing the service config on BTP:

**Option A — include the file** (simplest): place `server/config.json` in the repo before building the MTA. It will be bundled into the deployed module.

**Option B — env var** (no file, suitable for secrets/dynamic configs): set `CONFIG_JSON` to the full config JSON string in the MTA environment properties or via a `*.mtaext` extension descriptor:

```yaml
# config-dev.mtaext
_schema-version: "3.3"
extends: btp-status
modules:
  - name: btp-status-srv
    properties:
      CONFIG_JSON: '{"services":[...]}'
```

Then deploy with: `cf deploy mta_archives/btp-status_0.1.0.mtar -e config-dev.mtaext`

### Operations

```bash
cf mtas                               # list deployed MTAs
cf mta btp-status                     # show modules/services
cf logs btp-status-srv --recent       # recent logs
cf undeploy btp-status                # tear down
```
