# Changelog

## [v0.0.1] - 2026-06-16

### Added
- `interval` property on each service config: when set to a value greater than `0`, the server automatically runs a health check every `interval` seconds
- Resilient background scheduler (`schedulerService`): skips overlapping runs, catches and logs errors without stopping the timer, restores missing timers as a safety net
- Graceful shutdown: `SIGTERM` / `SIGINT` stop the scheduler and close the HTTP server cleanly
- Dark/light theme toggle (Moon/Sun icon) in the header of both Overview and History pages; preference persisted in `localStorage`
- Build-time version badge in the Overview header: `v{version}+{commit}.{build-date-PST}`

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
