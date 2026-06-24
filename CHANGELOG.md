# Changelog

## [v0.8.0] - 2026-06-23

### Added
- **XSUAA login/logout** — OAuth2 Authorization Code flow without `@sap/approuter` dependency; when `VCAP_SERVICES` exposes an `xsuaa` binding the app enters authenticated mode; login and logout are handled via a browser popup (`/login` → XSUAA → `/login/callback`); the callback exchanges the code for a JWT, verifies it with RS256 against the `verificationkey` from the binding, extracts `firstName`/`isAdmin`/`sub`/`exp`, and sets an httpOnly signed cookie (`btpauth`) using HMAC-SHA256 over the session payload with `clientsecret` as the key; all verification uses `node:crypto` with `timingSafeEqual` for HMAC comparison; the popup notifies the main window via `postMessage` so the UI updates without a page reload
- **Route-level auth guards** — `requireAuth` middleware protects `GET /api/check/:name` (Run Test) and `POST /api/sync`; `requireAdmin` protects `POST /api/eval-mode/:name` and `POST /api/schedule/:name`; all guards pass through (no-op) when XSUAA is not configured so local dev works unchanged
- **Person icon in the header** — empty `User` icon (click to log in) when not authenticated; filled `CircleUser` icon with a dropdown showing `Welcome, {firstName}` and a Log out item when authenticated; appears next to the moon/sun icon on both the Overview and Service detail pages
- **Auth-conditional UI** — Test All / Sync / Run Test buttons are hidden when XSUAA is enabled but the user is not logged in; Evaluation Mode and Schedule selectors remain visible but are disabled when the user is logged in without the admin scope (`{xsappname}.admin`); all controls revert to fully active when XSUAA is not configured
- `GET /api/me` — returns `{ enabled, loggedIn, firstName, isAdmin }` for session hydration on page load; `enabled: false` when no XSUAA binding is present
- `GET /login`, `GET /login/callback`, `GET /logout`, `GET /logout/callback` — auth flow endpoints; `/logout` clears the local session cookie then redirects the popup through `{xsuaa.url}/logout` to terminate the XSUAA session before `GET /logout/callback` notifies the opener and closes
- **Site switcher** — when `config.json` includes a top-level `sites` array (each entry has `name` and `url`), a compact dropdown appears in the Overview header next to the app title; the current site is auto-detected by comparing `window.location.origin` against each configured URL's origin; selecting a different site navigates via `window.location.replace()` so no extra browser history entry is added; the dropdown is hidden when fewer than 2 sites are configured
- **Page title sync** — `document.title` is kept in sync with the app title (e.g. `BTP Status (Ashburn)`); the city suffix is derived from the server's geo-resolved location and is reflected in both the `<h1>` and the browser tab title
- `POST /api/batch-download` — accepts `{ paths: string[] }` (max 500 entries, each `folder/filename`); reads each file from `RESPONSE_DIR`, packages them into an in-memory ZIP archive (STORE method), and returns `application/zip`; missing or pruned files are silently skipped; path traversal is rejected with `400`
- `SYNC_REMOTE_BATCH_SIZE` env var — controls how many files are requested per batch-download call (default `50`, minimum `1`)

### Fixed
- **Admin scope check** — admin detection now checks `{xsappname}.admin` against the JWT `scope` claim; `xsappname` from VCAP_SERVICES credentials includes the XSUAA tenant suffix (e.g. `btp-status!t12345`) and matches the actual scope string emitted by XSUAA; users assigned the `BTP Status Admin` role collection will now correctly have Evaluation Mode and Schedule selectors enabled
- **XSUAA logout** — `/logout` now redirects the popup through `{xsuaa.url}/logout` to terminate the XSUAA session before completing; previously only the local `btpauth` cookie was cleared, leaving the XSUAA session alive so the next login would skip the credentials screen
- **Auth popup fallback** — `useAuth` now polls for popup close; if `postMessage` is not received (cross-origin redirect through XSUAA can drop `window.opener`), login re-fetches `/api/me` to hydrate state and logout forces the logged-out state; this ensures the UI updates correctly in all browser environments
- **Login/logout audit logging** — successful login logs `sub`, `firstName`, `isAdmin` at INFO; logout logs `sub` and `firstName`; all write operations on protected routes (`/api/check/:name`, `/api/eval-mode/:name`, `/api/schedule/:name`, `/api/sync`) now include the caller's `user` (XSUAA `sub`) in the log entry

### Changed
- App title renamed from **BTP Service Status** to **BTP Status** in `client/index.html`
- **Overview timeline column widths adjusted** — service name column fixed at 170 px (down from 224 px), availability badge column fixed at 110 px (down from 160 px); timeline cell horizontal padding removed (`px-0`) so the dots bar uses the full column width
- **Status timeline dots fill the full available width and auto-shrink** — the dots bar now stretches to fill the entire column width using `flex-1` per dot; when the number of checks is below `maxDots` the remaining slots are padded with empty (gray) dots so the bar is always full; when checks exceed `maxDots` all dots are shown at a proportionally reduced width (gap collapses to 1 px) rather than truncating older entries; no fixed pixel calculations — CSS distributes the width evenly
- **Remote sync now uses batch ZIP download** — the sync job issues a `POST /api/batch-download` with up to `SYNC_REMOTE_BATCH_SIZE` (default 50) file paths per request; the server zips the requested files (STORE method, native implementation — no extra dependencies) and returns a single archive; the client extracts and writes each file to `RESPONSE_DIR` restoring the `service/filename` folder structure; if the remote does not expose the batch endpoint (e.g. an older instance), the sync job automatically falls back to the previous individual `GET /api/download` strategy (concurrency 10)

### Performance
- **Initial JS bundle reduced by ~63%** (481 kB → 165 kB minified; 147 kB → 55 kB gzip) — both pages are now lazy-loaded at the router level (`React.lazy`), and `LandscapeDiagram` (and therefore all of Mermaid, including its heaviest dependencies: mermaid core 593 kB, cytoscape 435 kB, katex 258 kB) is deferred until the user opens a landscape tab for the first time; diagram chunks remain code-split and are fetched on demand as before

## [v0.7.0] - 2026-06-23

### Added
- **Homepage link button** on the Service detail page header — when `homepage` is configured for a service, an ↗ icon button appears next to the service name in the top bar; clicking opens the homepage in a new tab (mirrors the same button on the Overview dashboard)
- **Open endpoint button in the response detail modal** — the Overview tab now shows a small ↗ icon button next to the endpoint name when the endpoint URL is an absolute `http(s)://` URL; clicking opens the endpoint in a new tab; `/dummy` and relative URLs show no button
- **History table filters** on the Service detail page — three compact dropdowns above the Check History table let users narrow down the visible rows by **Endpoint**, **From Location** (city), and **Status** (PASS / PASS (always ok) / FAIL / FAIL (always error)); endpoint and location options are derived from the current data set; a "Clear filters" link and an `X of Y` row count appear when any filter is active; stats (Uptime, Failed Checks, Total Checks, Avg Response Time) are always computed from all data in the selected time range, unaffected by the filters

### Fixed
- **Uptime percentages** now display with two decimal places (e.g. `99.95%` instead of `100%`) across the Overall Uptime stat card, landscape tab badges, per-service uptime badges on the Overview page, and the Uptime stat card on the Service detail page — integer rounding was masking meaningful precision differences
- **Overall Uptime stat card** was computed from raw per-endpoint history files, so services with multiple endpoints diluted failures heavily (e.g. 1 failed endpoint out of 5 for a check run counted as only 20% of that run's files failing, making a 99% service look like 100% in aggregate); now computed from the same grouped per-run history that the per-service uptime badges use, so the aggregate matches what is shown per service
- **Landscape tab badge uptime** had the same dilution bug; fixed with the same approach — grouped per-run history aggregated across all services in the landscape
- **Sync per-file log**: removed per-file `decompressed` bytes from the `Downloaded file` debug log entry; total transferred/decompressed MB is still logged once at the end of each sync run

### Changed
- **Landscape diagram node colours** refined for better contrast: degraded (warn) nodes now use `#B8860B` (dark goldenrod) instead of the previous brownish amber, giving a clearer yellow signal; failing (error) nodes now use `#990000` (deep red) instead of the previous dark maroon, making failures more visually distinct from warnings
- Analytics tracking script added to the app (`analytics.sapux.org`)

## [v0.6.0] - 2026-06-22

### Added
- **Landscape tabs** on the Overview page — a tabbed block between the aggregate stats row and the service groups; each tab represents a landscape defined in `config.json` under the `landscapes` array; tabs persist via URL hash (`#landscape-{name}`) so the same view is restored on reload or share
  - Each tab header shows the landscape name and an availability badge (uptime % coloured green / yellow / red) aggregated from all services whose `landscapes` field includes that landscape name
  - The tab pane renders a Mermaid flowchart diagram from `landscape.diagram`; diagram nodes whose ID matches a service name are styled with a coloured fill (green `#2e6f40` = OK, red `#f33` = error) and are clickable — clicking navigates to `/service/{name}`
- **Variable substitution** in `config.json` — define a top-level `variables` object (`"key": "value"`); any `{{key}}` placeholder in service endpoint fields (`url`, `username`, `password`, `headers`, `body`) is replaced with the variable value at server startup; useful for sharing credentials across multiple services without repetition
- **`/dummy` URL** on any endpoint — if `url` is set to `/dummy`, the actual HTTP fetch or browser login is skipped and a synthetic `200 OK` result is recorded immediately; evaluation mode (`alwaysok` / `alwayserror`) is still honoured; useful for endpoints not yet configured or deliberately disabled without removing them from the config
- `GET /api/landscapes` — returns the `landscapes` array from `config.json` (`[{ name, diagram }]`); used by the Overview page to render the tabs

### Changed
- **Version tag in the Overview header** now shows `v{version}+{commit}` (e.g. `v0.6.0+ebe1174`) on all screen sizes instead of the full `v{version}+{commit}.{date}` string; hovering shows a tooltip with the full build info including date, time, and local timezone (e.g. `v0.6.0+ebe1174 built at: 6/23/2026, 12:27:25 AM PDT`); the build timestamp is stored as a full UTC ISO string at build time and converted to the viewer's local timezone at display time; clicking the tag opens the GitHub Releases page (`https://github.com/sap-pilot/btp-status/releases`) in a new browser tab so users can browse all release notes

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
