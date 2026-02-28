# Analytics Engine Local Dev — Writes Spec

## Goal

Make `writeDataPoint()` actually persist data locally during development, instead of being a no-op. The storage format should be as close to the production ClickHouse schema as possible, so that future read support (SQL queries) can work against the same data.

## Architecture

The core constraint is that the wrapped binding worker (`analytics-engine.worker.ts`) runs inside **workerd** — a sandboxed runtime with no filesystem or Node.js access. To persist data, we bridge back to Node.js using a **service binding backed by a Node.js function**, the same pattern used by Miniflare's `serviceBindings` feature (see the `mini-kv` example in the Miniflare README).

### Components

```
User Worker
  │
  │  env.MY_DATASET.writeDataPoint({ ... })
  ▼
┌─────────────────────────────────────────────┐
│  Wrapped Binding Worker  (workerd)          │
│  analytics-engine.worker.ts                 │
│                                             │
│  - Receives writeDataPoint() call           │
│  - Serializes the data point to JSON        │
│  - Sends it via fetch() to the service      │
│    binding: env.persistence                 │
└──────────────┬──────────────────────────────┘
               │  fetch("http://placeholder/", {
               │    method: "POST",
               │    body: JSON.stringify(dataPoint)
               │  })
               ▼
┌─────────────────────────────────────────────┐
│  Node.js Service Function                   │
│  (runs in Miniflare host process)           │
│                                             │
│  - Full Node.js access (fs, modules, etc.)  │
│  - Receives the serialized data point       │
│  - Appends a row to a CSV file on disk      │
│  - Returns 200 OK                           │
└─────────────────────────────────────────────┘
```

### Part 1: Wrapped Binding Worker (`analytics-engine.worker.ts`)

**Runs in:** workerd (sandboxed)

**Role:** Receives `writeDataPoint()` calls from the user's worker and forwards them to the Node.js side.

**What changes:**

- The `Env` interface gains a `persistence` service binding (a `Fetcher`)
- `writeDataPoint()` stops being a no-op — it serializes the data point and POSTs it to `env.persistence`
- The worker adds `dataset` (from its existing `env.dataset` binding) and `timestamp` (generated at call time) before sending

**Why this part exists:** The wrapped binding is the interface that workerd presents to the user's code as `AnalyticsEngineDataset`. It must implement `writeDataPoint()` and is the only place where that method is called. But it cannot persist data itself — it has no disk access.

### Part 2: Plugin (`plugins/analytics-engine/index.ts`)

**Runs in:** Node.js (Miniflare host)

**Role:** Wires everything together — creates the service, registers the service binding as an inner binding on the wrapped binding, and defines the Node.js function that handles persistence.

**What changes:**

- `getBindings()` adds a new `innerBinding` to the wrapped binding: a service binding named `persistence` pointing to a dedicated analytics engine service
- `getServices()` (currently returns `[]`) returns a service for each dataset, backed by a Node.js function that handles the CSV write
- The persist path is resolved using the existing `analyticsEngineDatasetsPersist` shared option, following Miniflare conventions (defaults to `.wrangler/state/v3/analytics-engine/`)

**Why this part exists:** The plugin is the glue layer. It knows about the user's config (which datasets exist, where to persist), and it's responsible for creating the workerd service graph. It's the only place that can define a Node.js-backed service and inject it as a binding into the wrapped worker.

### Part 3: Node.js Persistence Function

**Runs in:** Node.js (Miniflare host)

**Role:** Receives serialized data points via fetch and appends them to CSV files on disk.

**What it does:**

1. Receives a POST request with a JSON body containing the data point
2. Maps the fields to the CSV column schema (see below)
3. Creates the CSV file with a header row if it doesn't exist
4. Appends one row per `writeDataPoint()` call
5. Returns `200 OK`

**Why this part exists:** This is where the actual I/O happens. It runs in Node.js so it has full access to `fs`, and in the future could use `chdb-node` or any other Node.js library for ClickHouse-compatible storage/querying.

## Data Schema

Each row mirrors the production ClickHouse table:

| Column                 | Type   | Source                                                |
| ---------------------- | ------ | ----------------------------------------------------- |
| `dataset`              | string | From the binding config (inner binding `env.dataset`) |
| `timestamp`            | string | ISO 8601, generated at write time                     |
| `index1`               | string | `indexes[0]`                                          |
| `blob1` – `blob20`     | string | `blobs[0..19]`, ArrayBuffer values hex-encoded        |
| `double1` – `double20` | number | `doubles[0..19]`                                      |
| `_sample_interval`     | number | Always `1` in local dev (no sampling)                 |

## Storage Format: CSV

**File location:**

```
<persist-path>/analytics-engine/<dataset-name>.csv
```

**Why CSV:**

- Analytics Engine is **append-only** — no updates, no deletes. CSV append (`fs.appendFileSync`) is a natural fit.
- **Zero dependencies** — no SQLite, no extra runtime, just `node:fs`.
- **Human-inspectable** — developers can `cat`, `tail -f`, or open the file to see what their worker is writing.
- **Future-compatible** — `chdb-node` can query CSV files directly with ClickHouse SQL (`SELECT * FROM file('path.csv', CSV)`), so when we add read support we don't need to migrate data or change the write format.

**Format rules:**

- Header row written on file creation
- One row per `writeDataPoint()` call
- Columns in fixed order: `dataset`, `timestamp`, `index1`, `blob1`–`blob20`, `double1`–`double20`, `_sample_interval`
- Empty/unset fields: empty string for blobs, empty for doubles
- Standard CSV escaping (quote fields containing commas, quotes, or newlines)

## Field Mapping

```ts
interface AnalyticsEngineDataPoint {
	indexes?: string[]; // indexes[0] → index1
	blobs?: (string | ArrayBuffer | null)[]; // blobs[0..19] → blob1..blob20
	doubles?: number[]; // doubles[0..19] → double1..double20
}
```

- `indexes[0]` → `index1` (only one index exists in production)
- `blobs[0..19]` → `blob1..blob20` (ArrayBuffer → hex string)
- `doubles[0..19]` → `double1..double20`
- `_sample_interval` → hardcoded `1` (no sampling in local dev)
- `timestamp` → `new Date().toISOString()` at write time
- `dataset` → from the binding's inner env

## Write Buffering

Writes are **buffered in memory** and flushed to CSV on a 30-second interval, matching the eventual consistency behavior of production Analytics Engine where data takes ~30-60 seconds to appear in SQL queries.

**Why buffer:**

- **Dev/prod parity** — if writes are instant locally, developers write code that queries immediately after writing. This works in dev but breaks in production. The buffer surfaces this timing issue early.
- **Matches production mental model** — Analytics Engine is not a real-time database. The delay reminds developers to design for eventual consistency.

**Flush behavior:**

- Data points accumulate in an in-memory array per dataset
- Every 30 seconds, the buffer is flushed: all buffered rows are appended to the CSV file in one batch
- On `wrangler dev` shutdown, any remaining buffered data is flushed before exit
- The flush interval (30s) is chosen to be noticeable but not painful for local dev

**Testing escape hatch:**

- Expose `POST /cdn-cgi/analytics-engine/flush` to force an immediate flush — useful for tests that need to write-then-read without waiting
- This endpoint is local-dev only, not a production API

## Persistence Behavior

- Data **persists across restarts** — consistent with KV, D1, R2, and other local bindings
- No file rotation or size limits for now — local dev datasets are small
- Writes are serialized through the flush interval, so no concurrent append issues

## Testing

Following the repo's established testing tiers:

### Tier 1: Miniflare Plugin Unit Tests

**Location:** `packages/miniflare/test/plugins/analytics-engine/index.spec.ts`

Uses the `miniflareTest()` helper to spin up a real Miniflare instance with analytics engine configured. Tests exercise the full write path (workerd → service binding → Node.js → CSV).

**Test cases:**

- **Basic write** — `writeDataPoint()` with blobs, doubles, and indexes creates a CSV row with correct values
- **Empty fields** — `writeDataPoint({})` with no data writes a row with empty fields
- **Partial fields** — Only blobs, only doubles, only indexes — each maps correctly
- **ArrayBuffer blobs** — Binary data is hex-encoded in the CSV
- **Null blobs** — Null entries in the blobs array are written as empty strings
- **Field limits** — 20 blobs and 20 doubles max; extra values are ignored (matching production)
- **Multiple writes** — Sequential `writeDataPoint()` calls append rows to the same file
- **Multiple datasets** — Different dataset bindings write to separate CSV files
- **Persistence across restarts** — Data survives Miniflare `setOptions()` (reconfiguration)
- **CSV header** — First write creates the header row; subsequent writes do not duplicate it
- **CSV escaping** — Blob values containing commas, quotes, and newlines are properly escaped
- **Timestamp** — Each row has a valid ISO 8601 timestamp
- **`_sample_interval`** — Always `1`
- **`dataset` column** — Matches the configured dataset name

**Verification approach:** After writing, call `POST /cdn-cgi/analytics-engine/flush` to force a flush, then read the CSV file directly from the persist directory using `node:fs` and assert on the contents. This follows the same pattern as KV/Cache tests that inspect persisted state via `MiniflareDurableObjectControlStub.sqlQuery()`.

```ts
const opts: Partial<MiniflareOptions> = {
	analyticsEngineDatasets: {
		ANALYTICS: { dataset: "my_dataset" },
	},
};
const ctx = miniflareTest(opts, async (global, env) => {
	env.ANALYTICS.writeDataPoint({
		blobs: ["Seattle", "USA"],
		doubles: [25, 0.5],
		indexes: ["a3cd45"],
	});
	return new global.Response("ok");
});

test("writeDataPoint persists to CSV", async () => {
	await ctx.mf.dispatchFetch("http://localhost/");
	// Read CSV from persist directory and verify contents
});
```

### Tier 2: Wrangler E2E Tests

**Location:** `packages/wrangler/e2e/dev.test.ts`

An E2E test already exists (lines 1098-1190) that verifies `writeDataPoint` doesn't crash. Extend it to verify data is actually persisted:

- Seed a worker that calls `writeDataPoint()` on fetch
- Run `wrangler dev`, hit the endpoint
- Verify the CSV file exists in `.wrangler/state/v3/analytics-engine/`
- Verify the CSV contains the expected data

### Tier 3: Vite Plugin Playground

**Location:** `packages/vite-plugin-cloudflare/playground/bindings/`

The existing playground already has a `WAE` binding configured. Update the test to verify writes persist (currently only tests that `writeDataPoint` doesn't throw).
