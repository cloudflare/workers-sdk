# Local Workers Observability: Developer Guide

This guide explains the experimental local observability workflow for Workers:

- capture traces, spans, and console logs from `wrangler dev`
- inspect them in Local Explorer
- query them from the Wrangler CLI
- expose them to coding agents through the hosted Codemode MCP endpoint
- control what an agent can access

The goal is to bring the production Workers Observability debugging experience into the local development loop.

## Quick Start

Start local development with observability capture enabled:

```bash
wrangler dev --experimental-observability
```

If you are testing from this local workers-sdk checkout, run the local Wrangler binary:

```bash
node packages/wrangler/bin/wrangler.js dev --experimental-observability
```

Then open Local Explorer:

```txt
http://localhost:<port>/cdn-cgi/explorer/
```

You can also press `e` in the interactive `wrangler dev` terminal to open Local Explorer.

## Enabling Codemode MCP

The hosted Codemode MCP endpoint is opt-in. Start `wrangler dev` with:

```bash
X_LOCAL_OBSERVABILITY_MCP=true wrangler dev --experimental-observability
```

From this checkout:

```bash
X_LOCAL_OBSERVABILITY_MCP=true node packages/wrangler/bin/wrangler.js dev --experimental-observability
```

The MCP endpoint is hosted by Miniflare at:

```txt
http://localhost:<port>/cdn-cgi/explorer/mcp
```

No separate MCP server process is required.

## What Gets Captured

When local observability is enabled, `wrangler dev` captures structured data for each Worker invocation:

- root invocation metadata
- HTTP status code
- outcome
- total duration
- spans for sub-operations
- Cloudflare binding calls such as D1, KV, R2, Durable Objects, fetch, and more
- console logs
- span attributes such as query text, URLs, binding names, response metadata, and timing
- exception stack traces when the runtime exposes them

The data is persisted locally in an internal D1/SQLite trace store.

## Local Explorer UI

Local Explorer adds an Observability section with three views:

### Traces

The Traces view shows recent local invocations.

Useful for:

- seeing which routes ran
- finding 500s/errors
- identifying slow requests
- expanding a request into a waterfall
- seeing binding spans such as D1, KV, fetch, R2, and Durable Object calls
- inspecting repeated binding calls, such as N+1 D1 query patterns

The Traces view supports simple query-style filtering, for example:

```txt
status:error kind:d1 dur:>100 db.query.text:orders
```

Supported examples:

- `status:error`
- `status:success`
- `kind:d1`
- `kind:fetch`
- `dur:>100`
- `db.query.text:orders`

### Logs

The Logs view shows captured `console.*` output.

Useful for:

- reading local app logs without scrolling terminal output
- filtering logs by level
- searching log messages
- correlating logs to traces

Log levels include:

- `error`
- `warn`
- `info`
- `log`
- `debug`

### MCP / Agent Access

The MCP view controls what a connected agent can access through the hosted Codemode MCP endpoint.

It includes:

- hosted MCP endpoint URL
- copyable agent config snippets
- log-level access controls
- per-resource access controls for D1, KV, R2, and Durable Objects
- an Advanced Access toggle for raw Local Explorer API access
- Agent Activity audit history

## Wrangler CLI Commands

Local observability data can also be queried from the CLI. This is the recommended zero-friction interface for local coding agents that already run shell commands.

### Recent Logs

```bash
wrangler observability logs --last 10
```

Filter by level:

```bash
wrangler observability logs --level error --last 20
```

JSON output:

```bash
wrangler observability logs --last 10 --json
```

### Recent Traces

```bash
wrangler observability traces --last 20
```

JSON output:

```bash
wrangler observability traces --last 20 --json
```

By default, Vite dev-runner plumbing spans are hidden. To include everything:

```bash
wrangler observability traces --include-runner-spans
```

### One Trace

```bash
wrangler observability trace <trace_id>
```

JSON output:

```bash
wrangler observability trace <trace_id> --json
```

### SQL Query

Run a read-only SQL query against the local trace store:

```bash
wrangler observability query "SELECT * FROM traces LIMIT 5"
```

JSON output:

```bash
wrangler observability query "SELECT COUNT(*) AS n FROM traces" --json
```

The SQL path is high leverage for agents because it lets them pull precise data instead of loading large logs or trace dumps into context.

Example: slowest endpoints:

```bash
wrangler observability query "
SELECT name, COUNT(*) AS requests, ROUND(AVG(duration_ms), 1) AS avg_ms, ROUND(MAX(duration_ms), 1) AS max_ms
FROM traces
WHERE parent_span_id IS NULL
GROUP BY name
ORDER BY avg_ms DESC
LIMIT 20
"
```

Example: recent error logs:

```bash
wrangler observability query "
SELECT created_at, operation, level, message, trace_id
FROM logs
WHERE level = 'error'
ORDER BY created_at DESC
LIMIT 20
"
```

### Agent Skill

Print agent guidance with commands, schema, and examples:

```bash
wrangler observability skill
```

Install the skill into detected coding agents:

```bash
wrangler observability skill --install
```

## Codemode MCP

The hosted Codemode MCP is an optional agent interface served by Miniflare/Local Explorer.

It is different from the previous standalone stdio MCP approach:

- no separate `node mcp-server.mjs` process
- no local server path configuration
- no package install
- hosted directly by the running local dev server
- exposes a programmable `cf` client to the agent

The endpoint is:

```txt
http://localhost:<port>/cdn-cgi/explorer/mcp
```

The MCP exposes two tools:

### `explorer_api`

Returns guidance for the agent, including what the `cf` client can access.

### `run`

Runs a JavaScript snippet against the local dev environment.

The snippet is an async function body with a `cf` client in scope. It should `return` JSON-serializable data.

Example:

```js
return await cf.traces.query(`
  SELECT trace_id, name, status_code, duration_ms
  FROM traces
  WHERE parent_span_id IS NULL
  ORDER BY start_ms DESC
  LIMIT 5
`);
```

## Codemode `cf` Client

The Codemode MCP `run` tool provides a governed `cf` client.

### Workers

```js
return await cf.workers();
```

Lists workers running in the current dev session and their bindings.

### Traces

```js
return await cf.traces.query(`SELECT * FROM traces LIMIT 10`);
```

Runs SQL against the local observability store.

Use this for traces and spans.

For logs, prefer `cf.traces.logs()` so log-level policy can be enforced.

### Logs

```js
return await cf.traces.logs({ level: "error", limit: 10 });
```

Respects the log-level access controls configured in Local Explorer.

### D1

```js
const dbs = await cf.d1.list();
return dbs;
```

```js
return await cf.d1.query("<database-id>", "SELECT name FROM sqlite_master LIMIT 10");
```

D1 access is opt-in per database from the Agent Access UI.

### KV

```js
return await cf.kv.namespaces();
```

```js
return await cf.kv.keys("<namespace-id>");
```

```js
return await cf.kv.get("<namespace-id>", "session");
```

KV access is opt-in per namespace.

### Durable Objects

```js
return await cf.do.namespaces();
```

```js
return await cf.do.objects("<namespace-id>");
```

```js
return await cf.do.query("<namespace-id>", "SELECT * FROM sqlite_master LIMIT 10");
```

Durable Object access is opt-in per namespace.

### R2

```js
return await cf.r2.buckets();
```

```js
return await cf.r2.objects("<bucket-name>");
```

R2 access is opt-in per bucket.

### Workflows

```js
return await cf.workflows.list();
```

```js
return await cf.workflows.instances("<workflow-name>");
```

### Raw Explorer API

```js
return await cf.fetch("GET", "/local/workers");
```

Raw Explorer API access is disabled by default. Enable **Advanced access → Allow raw Explorer API access** to use it.

This is intentionally guarded because it can bypass typed resource controls.

## Governance

Codemode MCP can access more than traces, so governance is enforced in the Miniflare-hosted MCP endpoint, not just the UI.

### Defaults

Allowed by default:

- traces
- spans
- non-debug logs, subject to log-level controls
- worker metadata

Denied by default:

- D1 app databases
- KV values
- Durable Object SQLite state
- R2 objects
- raw Explorer API access
- debug logs

### Log-Level Controls

The MCP page lets you choose which log levels the agent can read:

- `error`
- `warn`
- `info`
- `log`
- `debug`

`cf.traces.logs()` enforces these settings.

Raw SQL over the `logs` table through `cf.traces.query()` is blocked unless all log levels are enabled. This prevents an agent from bypassing log-level policy with hand-written SQL.

### Resource Controls

The MCP page lets you grant per-resource access:

- individual D1 databases
- individual KV namespaces
- individual R2 buckets
- individual Durable Object namespaces

If access is disabled, the Codemode MCP throws a denial error such as:

```txt
Access denied: d1:<id> is not enabled for agents
```

### Agent Activity Audit

Every Codemode `run` call is logged to `mcp_calls` and shown in the MCP page's Agent Activity table.

The audit row includes:

- submitted JS snippet
- attempted resource accesses
- status: `ok`, `denied`, or `error`
- response or error summary
- expandable request/response body

This gives developers visibility into what the agent asked for and what it received.

## Schema

The local observability store has three main tables.

### `traces`

One row per root invocation / distributed trace root.

```sql
traces(
  trace_id TEXT,
  root_span_id TEXT,
  parent_span_id TEXT,
  name TEXT,
  start_ms REAL,
  end_ms REAL,
  duration_ms REAL,
  outcome TEXT,
  status_code INTEGER,
  error TEXT,
  span_count INTEGER,
  created_at TEXT
)
```

### `spans`

Individual operations inside a trace.

```sql
spans(
  trace_id TEXT,
  span_id TEXT,
  parent_id TEXT,
  name TEXT,
  kind TEXT,
  start_ms REAL,
  end_ms REAL,
  duration_ms REAL,
  outcome TEXT,
  error TEXT,
  attributes TEXT
)
```

`attributes` is a JSON string containing details such as:

- `db.query.text`
- `cloudflare.binding.name`
- `cloudflare.binding.type`
- `cloudflare.d1.response.rows_read`
- `url.full`
- `http.request.method`
- `http.response.status_code`

### `logs`

Captured console output.

```sql
logs(
  trace_id TEXT,
  span_id TEXT,
  seq INTEGER,
  ts_ms REAL,
  level TEXT,
  message TEXT,
  operation TEXT,
  created_at TEXT
)
```

`message` is stored as a JSON array of the original `console.*` arguments.

## Example Agent Workflows

### What just happened?

```js
return await cf.traces.query(`
  SELECT trace_id, name, status_code, outcome, duration_ms
  FROM traces
  WHERE parent_span_id IS NULL
  ORDER BY start_ms DESC
  LIMIT 10
`);
```

### Is anything failing?

```js
return await cf.traces.query(`
  SELECT trace_id, name, status_code, outcome, error, duration_ms
  FROM traces
  WHERE parent_span_id IS NULL
    AND (status_code >= 500 OR error IS NOT NULL OR outcome != 'ok')
  ORDER BY start_ms DESC
  LIMIT 20
`);
```

### What routes are most active?

```js
return await cf.traces.query(`
  SELECT name, COUNT(*) AS requests
  FROM traces
  WHERE parent_span_id IS NULL
  GROUP BY name
  ORDER BY requests DESC
  LIMIT 20
`);
```

### Which routes are slowest?

```js
return await cf.traces.query(`
  SELECT name,
         COUNT(*) AS requests,
         ROUND(AVG(duration_ms), 1) AS avg_ms,
         ROUND(MAX(duration_ms), 1) AS max_ms
  FROM traces
  WHERE parent_span_id IS NULL
  GROUP BY name
  ORDER BY avg_ms DESC
  LIMIT 20
`);
```

### Which requests call D1 most often?

```js
return await cf.traces.query(`
  SELECT t.name, t.trace_id, COUNT(*) AS d1_calls
  FROM spans s
  JOIN traces t ON t.trace_id = s.trace_id AND t.parent_span_id IS NULL
  WHERE s.kind = 'd1'
  GROUP BY t.trace_id, t.name
  ORDER BY d1_calls DESC
  LIMIT 20
`);
```

### Show the spans for a trace

```js
return await cf.traces.query(`
  SELECT name, kind, ROUND(duration_ms, 1) AS ms, outcome, error, attributes
  FROM spans
  WHERE trace_id = '<trace_id>'
  ORDER BY start_ms ASC
`);
```

### Fetch recent allowed error logs

```js
return await cf.traces.logs({ level: "error", limit: 10 });
```

### Compare app data with trace data

```js
const errors = await cf.traces.query(`
  SELECT trace_id, name, status_code
  FROM traces
  WHERE parent_span_id IS NULL AND status_code >= 500
  ORDER BY start_ms DESC
  LIMIT 1
`);

const dbs = await cf.d1.list();
const rows = dbs[0]
  ? await cf.d1.query(dbs[0].id, "SELECT name FROM sqlite_master LIMIT 10")
  : [];

return { latestError: errors[0], visibleD1Tables: rows };
```

This is the main benefit of Codemode MCP: one agent call can join local traces with local data from the same dev session.

## Local vs Production Comparison

Local traces are best compared to production traces by **structure**, not raw latency.

Good comparisons:

- number of D1 calls
- number of KV reads
- number of fetches
- span tree shape
- query text
- error rate
- route volume

Avoid direct comparisons of absolute latency, because local runtime and production edge runtime are not identical environments.

Example use case:

> Production `GET /checkout` makes 10 D1 calls. A local refactor makes 3. The agent can query local traces and compare span counts to verify that the behavior changed as intended.

## Multi-Worker Traces

Local multi-worker trace stitching works when the workers share a single Miniflare instance, such as Vite plugin auxiliary workers.

Separate `wrangler dev` processes do not currently stitch into one trace because span context does not propagate across the dev-registry socket.

Summary:

- Vite single-instance multi-worker dev: supported
- separate `wrangler dev` processes: not stitched yet

## Troubleshooting

### MCP endpoint returns HTML on GET

That is expected. Browser `GET` requests are handled by the Local Explorer SPA.

Test MCP with a JSON-RPC `POST` instead:

```bash
curl -s -X POST http://localhost:<port>/cdn-cgi/explorer/mcp \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'
```

### MCP endpoint returns 404

Likely causes:

- dev server is not running a build with the Codemode MCP endpoint
- `X_LOCAL_OBSERVABILITY_MCP=true` was not set when `wrangler dev` started
- Miniflare/Local Explorer was not rebuilt after code changes
- wrong port

### No traces show up

Make sure capture is enabled:

```bash
wrangler dev --experimental-observability
```

Then send traffic to the Worker.

### CLI cannot find the trace store

If you used a custom persistence directory, pass the same path:

```bash
wrangler observability traces --persist-to <dir>
```

### D1/KV/R2/DO access denied in Codemode

Enable the specific binding in Local Explorer → Observability → MCP.

### Raw Explorer API access denied

Enable **Advanced access → Allow raw Explorer API access**.

Keep this off by default unless the agent needs an API not covered by typed helpers.

## Current Limitations

- Codemode MCP requires the dev server to be running.
- CLI queries work after dev server exit as long as the local persistence store remains.
- Raw log SQL is restricted by policy. Use `cf.traces.logs()` for governed log access.
- Separate `wrangler dev` processes do not currently stitch distributed traces.
- Local-vs-production comparison is not a first-class command yet.
- Some caught/swallowed errors may only appear through status codes and logs, depending on how the Worker handles exceptions.

## Recommended Mental Model

Use the interfaces for different jobs:

- **Local Explorer UI**: human debugging, waterfall inspection, governance controls
- **Wrangler CLI**: zero-friction agent/human querying, SQL, scripting
- **Codemode MCP**: governed programmable access to the whole Local Explorer data plane

The shared source of truth is the local observability store.
