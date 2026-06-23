# Changelog

## [v0.6.0] - 2026-06-22

### Added
- **Landscape tabs** on the Overview page — a tabbed block between the aggregate stats row and the service groups; each tab represents a landscape defined in `config.json` under the `landscapes` array; tabs persist via URL hash (`#landscape-{name}`) so the same view is restored on reload or share
  - Each tab header shows the landscape name and an availability badge (uptime % coloured green / yellow / red) aggregated from all services whose `landscapes` field includes that landscape name
  - The tab pane renders a Mermaid flowchart diagram from `landscape.diagram`; diagram nodes whose ID matches a service name are styled with a coloured fill (green `#2e6f40` = OK, red `#f33` = error) and are clickable — clicking navigates to `/service/{name}`
- **Variable substitution** in `config.json` — define a top-level `variables` object (`"key": "value"`); any `{{key}}` placeholder in service endpoint fields (`url`, `username`, `password`, `headers`, `body`) is replaced with the variable value at server startup; useful for sharing credentials across multiple services without repetition
- **`/dummy` URL** on any endpoint — if `url` is set to `/dummy`, the actual HTTP fetch or browser login is skipped and a synthetic `200 OK` result is recorded immediately; evaluation mode (`alwaysok` / `alwayserror`) is still honoured; useful for endpoints not yet configured or deliberately disabled without removing them from the config
- `GET /api/landscapes` — returns the `landscapes` array from `config.json` (`[{ name, diagram }]`); used by the Overview page to render the tabs

### Changed
- **Version tag in the Overview header** now shows `v{version}+{commit}` (e.g. `v0.6.0+ebe1174`) on all screen sizes instead of the full `v{version}+{commit}.{date}` string; hovering shows a tooltip with the full build info (`v{version}+{commit} built at: {date}`); clicking the tag opens the GitHub Releases page (`https://github.com/sap-pilot/btp-status/releases`) in a new browser tab so users can browse all release notes

### Fixed
- **Housekeeping UTC timestamp bug**: the background job that prunes response files older than `MAX_RESPONSE_STORAGE_DAYS` was using a local-timezone parser for all filenames; new-format filenames (v0.5.0+) use UTC timestamps, so the old parser would miscompute file age by the server's UTC offset, causing files to be retained or deleted at the wrong time — fixed by replacing the local parser with the shared `parseFilename` from `responseStore` which handles both UTC (new format) and local-time (old format) filenames correctly
- **Sync age filter**: `syncFromRemote` now skips remote files whose filename timestamp is older than `MAX_RESPONSE_STORAGE_DAYS`, preventing a sync job from re-downloading files that housekeeping has already pruned

### Changed
- `ServiceConfig` now supports an optional `landscapes` field (`string[]`) mapping a service to one or more landscapes for tab filtering and diagram coloring

## [v0.5.0] - 2026-06-19

### Added
- **Evaluation Mode selector** on the Service detail page header: controls how check results are interpreted and what `/health/:name` returns, independently of the execution schedule
  - **Condition Based** (default, green): `/health/:name` returns `200`/`500` based on actual condition results; files saved as `…_200.json` or `…_500.json`
  - **Always OK** (dark green): all executions — including scheduled checks, manual `/health/:name` requests, and Run Test — return `200 OK` regardless of actual results; response files are saved with status `203` to distinguish them from genuine passes; a confirmation dialog is shown before applying
  - **Always Error** (dark red): all executions return `500` regardless of actual results (a virtual failing condition is injected); response files saved with status `503`; a confirmation dialog is shown before applying
- **Schedule selector** on the Service detail page header: controls the auto-run interval for the service without restarting the server; options: Every 5 min / 10 min / 15 min / 30 min / 1 hour / Disable autorun; defaults to the `interval` value from `config.json`; changes take effect immediately (live reschedule); "Disable autorun" (`interval=0`) stops scheduled checks — only manual `/health/:name` or Run Test will trigger and record checks (evaluation mode is still honoured)
- `GET /api/eval-mode/:name` — current evaluation mode for a service (`{ mode: "condition" | "alwaysok" | "alwayserror" }`)
- `POST /api/eval-mode/:name` — set evaluation mode for a service; resets to `condition` on server restart
- `GET /api/schedule/:name` — current effective interval for a service in seconds (`{ intervalSeconds }`)
- `POST /api/schedule/:name` — set schedule override for a service (`{ intervalSeconds }`); `0` disables autorun; live-reschedules the service; resets on server restart
- Status code `203` (Always OK override): response records and filenames with this code are treated as passing (`PASS (always ok)`) in the UI, rendered as dark-green timeline dots, and counted as "up" in uptime calculations
- Status code `503` (Always Error override): records treated as failing (`FAIL (always error)`) in the UI, rendered as dark-red timeline dots
- **Geo-location stamping**: at server startup, a one-time lookup against `ip-api.com` resolves the server's public IP to a city name; spaces replaced with dashes (e.g. `Frankfurt-am-Main`); defaults to `unknown` if the lookup fails or times out; city is exposed via `GET /api/info` and shown in the Overview page title
- Response filename format changed to `yyyyMMdd-HHmmss_{endpointSlug}_{city}_{responseTimeMs}_{statusCode}.json/.png` (UTC timestamp, no `ms` suffix, endpoint name sanitized: non-alphanumeric runs → single dash); old-format files (`…_{index}_{ms}ms_{status}.json`) are still parsed and displayed correctly
- Status timeline dot tooltips now show: filename, date, time, from location, response time, and status code — all in browser local timezone
- Service detail page **response time chart** series are now labelled `{endpointName} ({city})` instead of just the endpoint name
- Service detail page **history table** gains a "From Location" column showing the `{city}` stored in each response filename; timestamps shown in browser local timezone

- **Mobile / small-screen layout** (screens narrower than 640 px — iPhones, small tablets):
  - Top bar controls (status badge, time-range selector, selectors, buttons, theme toggle) collapse into a hamburger menu in the top-right corner; tapping the icon opens a compact panel below the nav bar
  - App title shows a short `vX.Y.Z` version string inline on mobile; full `v+hash.date` build string remains on desktop
  - Status timeline dots column hidden on the Overview page to fit the name + stats columns on narrow screens
  - Aggregate stat card numbers use a smaller font size on mobile to prevent overflow in the 4-column grid
  - Service detail history table: "Endpoint" and "From Location" columns merged into a single "Endpoint (Location)" column on mobile, with the city rendered as a second line below the endpoint name; both columns remain separate on desktop

### Changed
- **Overview page title** changed to "BTP Status ({city})" where `{city}` is the geo-resolved city shown in parentheses once the server startup lookup completes (omitted if city is `unknown`)
- **Overview page**: aggregate stats row added above the service groups — Overall Uptime, Failed Checks, Total Checks, Avg Response Time; all computed from the full history window currently selected
- **Service detail page**: stats row (Uptime / Failed Checks / Total Checks / Avg Response Time) moved to above the status timeline; added "Failed Checks" card; "Avg Response Time" moved to last position; 4-column grid
- **Browser check**: `page.waitForURL` replaced with `page.waitForSelector(waitForSelector)` — the endpoint config field is now `waitForSelector` (CSS selector, e.g. `"#shellAppTitle"`) instead of `waitForUrl`; the recorded condition is now `[SELECTOR] found <selector>` instead of `[URL] matches <url>`; old `waitForElement` / `waitForUrl` config fields should be renamed to `waitForSelector`
- **Evaluation Mode selector**: "Condition Based" now shows the default (unstyled) trigger background instead of green, so coloured styling only appears for override modes (Always OK = dark green, Always Error = dark red)
- **Response time chart**: legend now always shown (previously hidden when there was only one series)

## [v0.4.0] - 2026-06-19

### Added
- **Clickable status timeline dots**: clicking a dot on the Overview dashboard navigates to the service detail page and automatically opens the response detail modal for that specific check; clicking a dot on the Service detail page timeline opens the response detail modal inline
- Status dots now show a hover highlight (`opacity-75` + `scale-110`) when clickable to signal interactivity
- **Deep-link URLs for history entries**
- Response detail modal: conditions table merged into the Overview tab (below the meta grid) so pass/fail results are immediately visible on open — the separate Conditions tab has been removed: opening a response detail modal (via timeline dot, history table row, or Overview navigation) updates the browser URL to `/service/{name}#{filename-without-extension}` using `replaceState`; visiting that URL directly reopens the same modal automatically — enabling copy-paste sharing of specific check results; closing the modal restores the base `/service/{name}` URL

### Changed
- **BTP deployment switched from Docker image to multi-buildpack**: `mta.yaml` now uses the CF apt-buildpack (reads `server/apt.yml`) to install the system libraries that Playwright's Chromium needs, followed by the nodejs_buildpack which installs Playwright (including its bundled Chromium via its npm install hook) and runs the app — no Docker image management required
- `server/apt.yml` added: installs only the shared libraries Playwright's Chromium requires on `cflinuxfs4` (`libnss3`, `libatk1.0-0`, `libgbm1`, etc.); `google-chrome-stable` is intentionally excluded — it pulls in systemd, GTK3, Mesa, and 100+ other packages (~821 MB) whose post-install scripts fail in CF containers
- Browser check: Playwright uses system Chrome at `/usr/bin/google-chrome-stable` when present, falling back to its own bundled Chromium (active path on BTP CF)
- `npm start` now runs `npx playwright install chromium` before starting Express: the CF nodejs_buildpack skips npm lifecycle scripts when `node_modules` is already packaged by MBT, so the browser download runs at container start instead — it is a no-op when the binary already exists
- Deployment script matrix regularised: `bd` = build + standard deploy; `bd-bg` (new) = build + blue-green deploy; `deploy` = standard redeploy (no build); `deploy-bg` = blue-green redeploy (no build)
- MTA module memory reduced from `1G` to `512M`; disk-quota kept at `4G` (Playwright's Chromium download at startup requires the headroom)
- Version bumped to `0.4.0` across all package files and `mta.yaml`

## [v0.3.0] - 2026-06-18

### Added
- **Response file housekeeping**: a background job runs once on startup then every 24 hours and deletes JSON and PNG response files whose filename date is older than `MAX_RESPONSE_STORAGE_DAYS` (default `3`). Set the env var to `0` to disable. File age is derived from the filename timestamp, not file mtime, so synced files are subject to the same retention policy as locally written ones.
- `MAX_RESPONSE_STORAGE_DAYS` environment variable (default `3`): controls how many days of response history to retain on disk.
- **Browser-based IAS login check** (`mode: "browser-ias-login"` on an endpoint): launches headless Chromium via Playwright, navigates to the configured URL, fills `#j_username` and `#j_password`, clicks the SAP IAS login form submit button, then waits until the current URL contains `waitForUrl` within `timeout` ms; a screenshot is captured after success or failure
  - Screenshot saved as `yyyyMMdd-HHmmss_{idx}_{ms}ms_{status}.png` alongside the JSON response record; same folder, same naming pattern as JSON files
  - Screenshot exposed via `/api/browse` (listed in the service folder), `/api/download?path=…` (served as `image/png`)
  - History detail modal: **Screenshot** tab appears automatically when a record has a screenshot; Request/Response tabs hidden for browser checks (not applicable)
  - Test popup: screenshot displayed inline below the endpoint header after a browser check run; Request/Response tabs hidden for browser endpoints
  - `[URL] matches <waitForUrl>` condition shown in Conditions tab so pass/fail reason is visible
  - The service mode override (`Unavailable` / `Disabled`) applies to browser checks exactly as for HTTP checks — virtual `[SERVICE_MODE]` condition injected and record saved with `overallStatus 500`
- `GET /api/download?path=folder/file.png` now returns the raw screenshot buffer with `Content-Type: image/png`
- `EndpointConfig` extended with optional fields: `mode`, `username`, `password`, `waitForUrl`, `timeout`; existing fields (`method`, `headers`, `body`, `conditions`) made optional to support browser-only endpoints defined without them
- **Service mode selector** on the Service detail page: a colour-coded select in the header lets admins switch each service between three modes without restarting the server
  - **Enabled** (green): normal behaviour — checks run on schedule and `/health/:name` returns `200`/`500` based on results
  - **Unavailable** (red): scheduled checks continue to run and results are recorded for history, but `/health/:name` always returns `500` (signals unavailability to Azure Traffic Manager even when the underlying service is healthy)
  - **Disabled** (amber): the scheduler stops running checks for this service and `/health/:name` returns `500 "service is marked as disabled"` immediately without running a check
- Confirmation dialog (AlertDialog) appears before applying "Unavailable" or "Disabled" so admins do not accidentally flip a live service
- Tooltip on the mode selector explains each mode's effect on hover
- `GET /api/service-mode/:name` — returns the current override mode for a service (`{ mode: "enabled" | "unavailable" | "disabled" }`)
- `POST /api/service-mode/:name` — sets the override mode for a service (`{ mode }` in JSON body)
- Overrides are held in-memory and reset to `enabled` on server restart (intentional — a redeploy restores normal operation)

### Fixed
- `/api/*` responses now always carry `Cache-Control: no-store`, preventing browsers from caching API responses (including PNG screenshots) and eliminating spurious `304 Not Modified` replies on repeated `/api/download` requests
- Remote sync (`SYNC_REMOTE`) now correctly preserves binary files: `fetchRaw` returns a raw `Buffer` instead of converting to a UTF-8 string, and `downloadOne` writes that buffer directly to disk with no encoding conversion — previously PNG screenshots were corrupted during sync because the binary data was round-tripped through `buf.toString('utf-8')` then written back as a UTF-8 string
- "Run Test" and "Test All" now correctly reflect the service mode override: a virtual `[SERVICE_MODE] == enabled` condition is appended to each endpoint's results when the mode is Unavailable or Disabled, causing the test to report failure and saving the response record with `overallStatus 500` so the timeline renders the check as red
- Availability badge on the Overview and Service detail pages now uses three-state colour coding: green = 100% uptime, yellow = below 100% but latest check passed, red = latest check still failing
- "Run Test" no longer causes a black screen when the backend returns a server error: the response status is now checked before parsing the body as a `CheckResult`; non-OK responses surface the server error message inside the dialog instead of crashing the render tree
- Added a React error boundary (`ErrorBoundary`) wrapping the entire app so any future unhandled render error shows a recoverable error screen instead of a blank page
- `docker/Dockerfile` reworked: image is now built from locally compiled artifacts (`server/dist/` + `server/public/`) instead of git-cloning from GitHub; only server production dependencies are installed inside the image; switched base to `node:22-slim`; removed `git` package
- `docker/build.sh` reworked: script now runs `npm run build` locally first, then packages the compiled output into the Docker image; supports `SKIP_BUILD=1` to reuse an existing build; SHA tags remain for guaranteed CF image refresh

### Changed
- Select option label renamed from "Mark as Unavailable" to "Unavailable" for consistency with other options
- Version bumped to `0.3.0` across all package files and `mta.yaml`
- `npm run deploy-bg` added: blue-green CF deploy of an existing `.mtar` archive without rebuilding (`cf deploy --strategy blue-green --skip-testing-phase`)
- `npm run deploy` added: standard CF deploy of an existing `.mtar` archive without rebuilding
- `docker/Dockerfile` added: Node.js 22 image that clones the app from GitHub at build time, installs all Chromium system libraries via `playwright install --with-deps chromium`, builds client + server, and starts Express; includes `openssh-server` for `cf ssh` support on Cloud Foundry Docker deployments
- `docker/README.md` added: instructions for building, tagging, publishing, running locally, and deploying the image on SAP BTP Cloud Foundry via MTA

## [v0.2.0] - 2026-06-17

### Added
- `GET /api/browse` — returns the full folder/file structure under `./response/` as `{ folders: { serviceName: [filename, ...] } }`
- `GET /api/download?path=folder/filename.json` — downloads a single response file; path is validated (no `..`, no absolute paths, must be exactly `folder/filename`)
- `SYNC_REMOTE` environment variable: when set, the server fetches the remote instance's `/api/browse` at startup, computes missing files, and downloads them in batches of 10; logs each file path at `DEBUG` level and logs total transferred/decompressed MB and elapsed time at `INFO` on completion
- `SYNC_INTERVAL` environment variable (default `900`): seconds between periodic remote sync runs; minimum enforced at 60 s; the same diff/download logic as the startup sync is reused; scheduler uses `unref()` so it does not block graceful shutdown
- Gzip compression middleware using native `node:zlib`: all text/JSON/JS/CSS/HTML/XML responses are gzip-compressed; binary images (JPG, PNG, etc.) are passed through uncompressed; respects `Accept-Encoding` and cleans up `Content-Length`
- `enable-ssh: true` added to `btp-status-srv` parameters in `mta.yaml`

- Responsive status dots: `maxDots` on both Overview and History pages is derived from `window.innerWidth` via a `useWindowWidth` hook so the timeline shrinks gracefully on tablet and phone viewports instead of overflowing (Overview formula accounts for the fixed service/stats columns; History formula accounts for card padding)
- Server no longer crashes when `config.json` is missing at startup: logs a `WARN` and starts with zero services so the process stays alive until an admin supplies `CONFIG_JSON` via env var and restarts
- `GET /api/info` endpoint: returns server capabilities (`{ syncRemote: boolean }`) used by the UI to show/hide the Sync button
- `POST /api/sync` endpoint: triggers an on-demand remote sync (diff + batch download); returns stats (`files`, `transferredMB`, `decompressedMB`, `elapsedSec`); returns `400` if `SYNC_REMOTE` is not configured; concurrent calls are safely serialised (second call returns `busy: true` immediately)
- **Sync button** in the Overview header: appears only when `SYNC_REMOTE` is configured; uses the refresh icon (spinning blue while active); positioned after the "Test all" button; auto-refreshes the dashboard on completion; replaced the standalone Refresh button
- Favicon added: `favicon.ico` + PNG sizes (16×16, 32×32, 180×180, 192×192, 512×512) served from `client/public/` so Vite bundles them into the build
- Overview header logo replaced: `Activity` icon swapped for `favicon-32x32.png`
- Express static file caching: JS and CSS assets served with `Cache-Control: public, max-age=31536000, immutable` (Vite content-hashed filenames make this safe); images/favicons with `public, max-age=86400`; HTML always `no-cache` so clients pick up new asset hashes on deploy

- Test modal: each endpoint now has a collapse/expand toggle (chevron button); content area uses `overflow-y-auto` so long results scroll within the modal height rather than pushing it off-screen
- Response time line chart on the Service detail page: pure SVG chart (no dependencies) rendered between the status timeline and the stats cards; one line series per endpoint with a distinct colour; responsive width via `ResizeObserver`; Y axis uses a "nice" rounded maximum; X axis shows time labels (date+time when range spans multiple days); dots rendered on each data point when total records ≤ 200 (native `<title>` tooltip shows endpoint name, time, and ms); colour legend shown below the chart when there are multiple endpoints

### Changed
- `package.json` version bumped to `0.2.0`; `mta.yaml` version synced to `0.2.0`
- `npm run bd` now deploys with `--strategy blue-green --skip-testing-phase` to minimise disruption: CF starts a parallel green instance, waits for it to become healthy, then cuts over traffic before removing the old instance
- `keep-existing: env: true` added to `mta.yaml` so environment variables set via `cf set-env` (e.g. `CONFIG_JSON`, `SYNC_REMOTE`) are preserved across deployments and not reset to `mta.yaml` defaults

## [v0.1.0] - 2026-06-16

### Added
- `interval` property on each service config: when set to a value greater than `0`, the server automatically runs a health check every `interval` seconds
- Resilient background scheduler (`schedulerService`): skips overlapping runs, catches and logs errors without stopping the timer, restores missing timers as a safety net
- Graceful shutdown: `SIGTERM` / `SIGINT` stop the scheduler and close the HTTP server cleanly
- Dark/light theme toggle (Moon/Sun icon) in the header of both Overview and History pages; preference persisted in `localStorage`
- Build-time version badge in the Overview header: `v{version}+{commit}.{build-date-PST}`

- Optional `homepage` URL per service: when set, an ↗ icon button appears next to the service name on the overview dashboard and opens the URL in a new tab
- "Test all" button (⚡) in the overview header: runs health checks for all services in parallel, shows a pulsing "Running…" state while active, then auto-refreshes the dashboard on completion
- Service detail page moved from `/history/:name` to `/service/:name`; old URL redirects to `/overview`

### Changed
- `npm run dev` builds the React client once then starts Express on a single port (removed dual-server / Vite proxy setup)
- `Copy URL` button in the Test modal copies the `/health/:name` probe URL; result summary (PASS/FAIL, elapsed, endpoints) moved into the dialog title row

### Fixed
- Moon icon shown in dark mode, Sun icon shown in light mode (was reversed)

### Added

- Initial release
- HTTP health check endpoint `GET /health/:name` compatible with Azure Traffic Manager (HTTP 200/500)
- Gatus-style condition evaluation supporting:
  - `[STATUS]` — HTTP status code comparison
  - `[RESPONSE_TIME]` — response time in milliseconds
  - `[BODY]` — raw body string comparison
  - `[BODY].path.to.field` — JSON path field extraction
  - `[HEADER.name]` — response header value comparison
  - `len([BODY].array)` — array/object length function
  - `pat(*glob*)` — glob/wildcard pattern matching (case-insensitive)
  - Operators: `==`, `!=`, `<`, `>`, `<=`, `>=`
- File-based response storage at `./response/{service}/{timestamp}_{idx}_{ms}ms_{status}.json`
- Overview dashboard at `/overview`:
  - Services grouped by `group` name (Gatus-style layout)
  - Color-coded status timeline dots (green=pass, red=fail, gray=no data)
  - Uptime percentage and last response time per service
  - Configurable time range: 1h / 6h / 12h / 24h / 48h / 72h
- Service history page at `/history/:name`:
  - Full-width status timeline
  - Stats: uptime %, avg response time, total checks
  - Sortable history table (newest first) with endpoint name and status badge
  - Click any row to open request/response drill-down modal
- Response detail modal with tabs: Overview, Request, Response, Conditions
  - JSON bodies prettified automatically
  - Per-condition pass/fail with actual vs expected values
- **Structured logging** with pino + pino-pretty:
  - `INFO` — server startup, incoming `/health/:name` requests, pass/fail outcomes, manual test triggers
  - `DEBUG` — outgoing HTTP request details (method, URL) and full response (status, time, body preview)
  - `WARN` — each individual failed condition with actual vs expected values (yellow)
  - `ERROR` — network/connection errors from fetch (red, includes full error object + stack)
  - Log level configurable via `LOG_LEVEL` env var (default: `debug`)
- `GET /api/check/:name` — JSON endpoint for manual test runs; returns structured results including full request/response data per endpoint
- **"Run Test" button** on `/history/:name` page:
  - Opens a popup dialog to trigger an on-demand health check
  - Per-endpoint tabs: **Conditions** (pass/fail table with actual vs expected), **Request** (method, URL, headers, body), **Response** (status, response time, headers, body — JSON auto-prettified)
  - Automatically refreshes the history table and timeline once the test completes
- `CONFIG_JSON` environment variable: supply the full service config as a JSON string, bypassing the config file entirely — takes priority over `CONFIG_FILE` (useful for BTP environment properties and MTA extension descriptors)
- Express serves React build directly (single process, single port — no separate Vite dev server)
- React frontend (Vite + TypeScript) with shadcn/ui components and dark theme
- Express backend with route/controller/service layering
- SAP BTP Cloud Foundry deployment via MTA (`mta.yaml`)
- Environment variable configuration: `PORT`, `CONFIG_JSON`, `CONFIG_FILE`, `RESPONSE_DIR`, `LOG_LEVEL`
