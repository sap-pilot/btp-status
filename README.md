# BTP Service Status

A lightweight, file-backed status page and health checker for SAP BTP services. Compatible with Azure Traffic Manager's HTTP probe mechanism and provides a Gatus-style admin dashboard for reviewing availability history.

## Features

- **HTTP health checks** with Gatus-style condition evaluation (`[STATUS]`, `[BODY]`, `[HEADER.*]`, `[RESPONSE_TIME]`, `len()`, `pat()`)
- **Azure Traffic Manager integration** — `GET /health/:name` returns `200 OK` when all conditions pass, `500` with failure details when any condition fails
- **Gatus-style overview dashboard** at `/overview` — services grouped by group name with colored status timeline dots
- **Per-service history** at `/history/:name` — uptime %, avg response time, full check history table
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

# 2. Copy sample config and edit
cp config-sample.json config.json
# Edit config.json with your real service endpoints

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

Create `config.json` (based on `config-sample.json`):

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
| `endpoints[].name` | string | Display name for this endpoint |
| `endpoints[].url` | string | URL to probe |
| `endpoints[].method` | string | HTTP method (`GET`, `POST`, etc.) |
| `endpoints[].headers` | object | Request headers (key-value pairs) |
| `endpoints[].body` | string\|null | Request body (JSON string or null) |
| `endpoints[].conditions` | string[] | Conditions to validate (Gatus syntax) |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health/:name` | Run health check; returns `200 OK` or `500 <failure details>` (Azure Traffic Manager) |
| `GET /overview` | Overview dashboard UI |
| `GET /history/:name` | Service history UI (includes "Run Test" button) |
| `GET /api/services` | List all services (JSON) |
| `GET /api/check/:name` | Run health check, return structured JSON results (used by Test popup) |
| `GET /api/overview?hours=24` | Overview data for all services (JSON) |
| `GET /api/history/:name?hours=24` | History file list for a service (JSON) |
| `GET /api/history/:name/:filename` | Full request/response detail for one check (JSON) |

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
./response/{service-name}/yyyyMMdd-HHmmss_{endpointIdx}_{responseTimeMs}ms_{200|500}.json
```

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
| `INFO` | Server startup · incoming `/health/:name` requests · pass/fail result · manual test trigger |
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
| `CONFIG_FILE` | `./config.json` | Path to config JSON file |
| `RESPONSE_DIR` | `./response` | Directory for response file storage |
| `LOG_LEVEL` | `debug` | Pino log level: `trace`, `debug`, `info`, `warn`, `error` |

## Deployment (SAP BTP MTA)

### Prerequisites

```bash
npm install -g mbt                  # Cloud MTA Build Tool
cf install-plugin multiapps         # CF MTA plugin (once per CF CLI install)
```

### Build & Deploy

```bash
# Build the MTA archive
mbt build

# Log in
cf login -a https://api.cf.<region>.hana.ondemand.com
cf target -o <org> -s <space>

# Deploy
cf deploy mta_archives/btp-status_0.1.0.mtar
```

### Post-deploy config

Upload your `config.json` to the app container or set `CONFIG_FILE` to point to a bound service that provides the config. The simplest approach is to include `config.json` in the `server/` directory before building the MTA.

### Operations

```bash
cf mtas                               # list deployed MTAs
cf mta btp-status                     # show modules/services
cf logs btp-status-srv --recent       # recent logs
cf undeploy btp-status                # tear down
```
