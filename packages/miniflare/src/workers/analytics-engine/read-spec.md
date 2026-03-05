# Analytics Engine Local Dev — Reads Spec

## Goal

Allow developers to query their locally-written Analytics Engine data using the same SQL API they use in production, running entirely locally via DuckDB with the `chsql` ClickHouse compatibility extension.

## How Production WAE SQL Works

In production, a developer queries the WAE SQL API at:

```
POST /client/v4/accounts/<account_id>/analytics_engine/sql
```

The dataset name is used directly as a table name in SQL:

```sql
SELECT blob1 AS city, SUM(double2) AS total
FROM my_dataset
WHERE double1 > 0
GROUP BY city
ORDER BY total DESC
LIMIT 10
```

### Supported SQL Subset

WAE SQL is intentionally limited ([docs](https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/statements/)):

- `SELECT <expressions>` with aliases
- `FROM <dataset>` or `FROM (<subquery>)` — **single table only, no JOINs, no UNIONs**
- `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, `LIMIT`, `OFFSET`
- Aggregate functions (SUM, COUNT, AVG, MIN, MAX, etc.)
- ClickHouse functions: `toStartOfInterval`, `intDiv`, `quantile`, date/time functions, etc.
- `FORMAT` clause (JSON, JSONEachRow, TabSeparated)

### What's NOT supported

- `JOIN`, `UNION`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`
- Multiple tables in a single query
- CTEs (`WITH` clause) — not documented as supported in WAE

## Query Engine: DuckDB + chsql

### Why DuckDB?

We evaluated three options for the local query engine:

| Engine                     | Binary size                        | ClickHouse SQL compat                       | Install                                          | Notes                                                                      |
| -------------------------- | ---------------------------------- | ------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| chdb (embedded ClickHouse) | 116-169 MB + manual system install | Native                                      | Broken npm story, requires `libchdb` outside npm | Too heavy, bad DX                                                          |
| SQLite (via DO)            | 0 (built-in)                       | None                                        | Free                                             | No ClickHouse function support, can't register custom functions in workerd |
| **DuckDB + chsql**         | **59-110 MB per platform**         | **100+ ClickHouse functions via extension** | **Clean npm install, per-platform packages**     | **Best trade-off**                                                         |

### DuckDB

[DuckDB](https://duckdb.org/) is an embedded OLAP database — the "SQLite of analytics." It runs in-process with no server.

Node.js packages use the same per-platform optional dependency pattern as `esbuild`, `swc`, and `turbo`:

- `@duckdb/node-bindings-darwin-arm64` (~110 MB)
- `@duckdb/node-bindings-linux-x64` (~65 MB)
- `@duckdb/node-bindings-linux-arm64` (~59 MB)
- npm resolves the correct platform automatically — developers only download their platform's binary

Key capabilities:

- `read_csv()` table function to query CSV files directly
- Full SQL support (SELECT, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT, subqueries, CTEs)
- Community extension system for additional functionality
- In-process — no network, no server

### chsql Extension

[`chsql`](https://github.com/Query-farm/clickhouse-sql) is a DuckDB community extension that implements **100+ ClickHouse SQL functions** as DuckDB macros:

- `toStartOfInterval(ts, INTERVAL 1 HOUR)`
- `intDiv(a, b)`
- `toDateTime`, `toDate`, `toString`
- ClickHouse date/time functions, string functions, math functions
- System table emulation

The extension is **lazy-loaded** — it downloads on first use, not on `npm install`:

```sql
INSTALL chsql FROM community;
LOAD chsql;
```

This means the base DuckDB binary is all that ships with the npm install. The ClickHouse compat layer is pulled in automatically on first analytics engine query.

## Local Dev Approach

### The Problem

Locally, each dataset is stored as a CSV file:

```
.wrangler/state/v3/analytics-engine/my_dataset.csv
```

DuckDB can query CSV files directly using `read_csv()`:

```sql
SELECT * FROM read_csv('/path/to/my_dataset.csv', header=true)
```

But the user writes SQL with bare table names (`FROM my_dataset`), not `read_csv()` calls.

### The Solution: CTE Rewriting (mirroring production)

In production, all datasets live in a single ClickHouse table. When a user queries `FROM my_dataset`, the WAE SQL API rewrites the query to scope it to that dataset — the user never sees this.

We mimic the same pattern locally. We parse the user's SQL to extract the table name, then prepend a `WITH` CTE that defines that table name as a filtered view over the CSV file:

**User writes:**

```sql
SELECT blob1, SUM(double1) FROM my_dataset WHERE index1 = 'foo' GROUP BY blob1
```

**We rewrite to:**

```sql
INSTALL chsql FROM community;
LOAD chsql;
WITH my_dataset AS (
  SELECT * FROM read_csv('/path/to/my_dataset.csv', header=true)
  WHERE dataset = 'my_dataset'
)
SELECT blob1, SUM(double1) FROM my_dataset WHERE index1 = 'foo' GROUP BY blob1
```

**Why this approach:**

- **Mirrors production** — production does the same conceptual rewrite (scope query to dataset). The CTE makes the dataset name "just work" as a table reference without modifying the user's query body at all.
- **User's SQL is untouched** — we only prepend the CTE. The `FROM my_dataset` in their query resolves to the CTE, not a real table. No AST surgery on their SELECT/WHERE/GROUP BY.
- **Forward-compatible** — if we later move to a single CSV for all datasets (closer to prod's single table), the `WHERE dataset = 'my_dataset'` filter already handles it. We'd just change the `read_csv()` path.
- **Subqueries work** — CTEs are scoped to the entire statement, so nested subqueries resolve the table name to the CTE automatically:
  ```sql
  WITH my_dataset AS (...)
  SELECT * FROM (
    SELECT blob1, SUM(double1) as total
    FROM my_dataset  -- resolves to CTE
    GROUP BY blob1
  ) WHERE total > 100
  ```

**DuckDB executes it** with full ClickHouse function support via chsql, and returns results.

## SQL Parsing: `node-sql-parser` (MySQL mode)

We use [`node-sql-parser`](https://github.com/taozhi8833998/node-sql-parser) to parse the user's SQL and extract the dataset table name.

Production WAE uses a Rust parser ([sql-ast](https://docs.rs/sql-ast/latest/sql_ast/)) which isn't usable from Node.js. `node-sql-parser` is the best JS alternative:

- **WAE SQL is standard SQL** — the supported subset (SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT) is plain ANSI SQL. No ClickHouse-specific syntax needs parsing. MySQL mode handles it all.
- **AST table extraction** — parse to AST, walk all `FROM` clauses (including inside subqueries) to find the single dataset table name. Since WAE is single-table only, there will be exactly one distinct table name across the entire query. We only need to extract it — the CTE approach means we don't rewrite the user's SQL, just prepend to it.
- **Well-maintained** — 4M+ weekly downloads, ~150K per dialect build.
- **Runs on Node.js side only** — not bundled into workerd, so dependency size is not a concern for the worker bundle.

## Rewrite Flow

```
User SQL string
  │
  ▼
┌─────────────────────────────────────┐
│  node-sql-parser.parse(sql)         │
│  → AST                              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Extract table name from AST        │
│  e.g. "my_dataset"                  │
│                                     │
│  Validate dataset exists (CSV file  │
│  exists on disk)                    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Prepend CTE + chsql setup:        │
│                                     │
│  INSTALL chsql FROM community;      │
│  LOAD chsql;                        │
│  WITH my_dataset AS (               │
│    SELECT * FROM read_csv('...csv', │
│      header=true)                   │
│    WHERE dataset = 'my_dataset'     │
│  )                                  │
│  <original user SQL>                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  duckdb.query(rewrittenSql)         │
│  → query result                     │
└─────────────────────────────────────┘
```

## Local SQL API Endpoint

The SQL API is exposed on the existing `wrangler dev` server using the `/cdn-cgi/` route convention — the same pattern used for triggering scheduled handlers (`/cdn-cgi/handler/scheduled`), email handlers (`/cdn-cgi/handler/email`), and the local explorer (`/cdn-cgi/explorer`).

These routes are intercepted by Miniflare's entry worker (`packages/miniflare/src/workers/core/entry.worker.ts`) before reaching the user's worker, so there's no conflict with user routes.

### Endpoint

```
POST http://localhost:8787/cdn-cgi/analytics-engine/sql
```

No separate port. Runs on the same dev server, gated behind a feature flag (similar to `unsafeTriggerHandlers` / `unsafeLocalExplorer`).

### Request Format

- **Method:** `POST` (matching production — production is POST only, query as raw body)
- **Body:** Raw SQL string (not JSON-wrapped)
- **No authentication** — local dev, no token needed

```bash
curl -X POST http://localhost:8787/cdn-cgi/analytics-engine/sql \
  --data "SELECT blob1, SUM(double1) FROM my_dataset GROUP BY blob1"
```

### Request Flow

```
POST /cdn-cgi/analytics-engine/sql
  │
  ▼
Entry Worker (workerd)
  │  intercepts /cdn-cgi/analytics-engine/*
  │  forwards to loopback
  ▼
Node.js Loopback Handler
  │  parse SQL → extract table name
  │  prepend CTE with read_csv() path
  │  load chsql extension
  │  duckdb.query(rewrittenSql)
  ▼
Response to client
```

### Response Format

Matches the production response shape. The `FORMAT` clause in the SQL controls the output format (JSON default, JSONEachRow, TabSeparated). DuckDB supports JSON and CSV output natively; we may need to map WAE FORMAT values to DuckDB equivalents.

## Query Binding (`AnalyticsEngineSQL`)

In addition to the HTTP endpoint, we expose a query binding that workers can use directly — modeled after the [`@clickhouse/client-web`](https://github.com/ClickHouse/clickhouse-js) API.

### Usage

```ts
// In worker code
const result = await env.MY_DATASET_SQL.query({
	query: "SELECT blob1, SUM(double1) FROM my_dataset GROUP BY blob1",
});

const json = await result.json(); // parsed JS object
const text = await result.text(); // raw string
const stream = result.stream(); // ReadableStream<Uint8Array>
```

### Why not `Row[]` for stream?

The `@clickhouse/client-web` streams `Row[]` objects, but our binding crosses a service binding boundary (workerd ↔ Node.js via `fetch()`). Service bindings can only transport bytes, not structured objects. So `.stream()` returns a `ReadableStream<Uint8Array>` of the raw response body.

For structured streaming, the user would use `JSONEachRow` format and parse line-by-line:

```ts
const result = await env.MY_DATASET_SQL.query({
	query: "SELECT * FROM my_dataset FORMAT JSONEachRow",
});
for await (const chunk of result.stream()) {
	// each chunk is UTF-8 bytes, lines are newline-delimited JSON objects
}
```

### Implementation

The binding is a thin wrapper around a service binding `fetch()` to the same Node.js query function that powers the HTTP endpoint. The result object wraps the `Response`:

```ts
class AnalyticsEngineSQLResult {
	#response: Response;
	constructor(response: Response) {
		this.#response = response;
	}

	json() {
		return this.#response.json();
	}
	text() {
		return this.#response.text();
	}
	stream() {
		return this.#response.body;
	}
}
```

### Architecture — Shared Query Function

Both the HTTP endpoint and the binding call the same underlying Node.js query function. Two entry points, one implementation:

```
env.MY_DATASET_SQL.query()                          curl POST /cdn-cgi/analytics-engine/sql
  │                                                    │
  ▼                                                    ▼
Wrapped Binding Worker (workerd)                   Entry Worker (workerd)
  │  fetch() via service binding                       │  forward to loopback
  ▼                                                    ▼
  └──────────────────┐              ┌──────────────────┘
                     ▼              ▼
              Node.js Query Function
              │  parse SQL (node-sql-parser)
              │  extract table name
              │  prepend CTE with read_csv() path
              │  INSTALL/LOAD chsql
              │  duckdb.query(rewrittenSql)
              ▼
           Response (bytes)
```

The binding goes directly through the service binding to Node.js — it does **not** loop through the HTTP endpoint. No unnecessary serialization roundtrip.

## Dependencies

| Dependency                 | Purpose                          | Size                                                          | Install       |
| -------------------------- | -------------------------------- | ------------------------------------------------------------- | ------------- |
| `@duckdb/node-api`         | Query engine                     | 59-110 MB (per-platform, auto-resolved via npm optional deps) | `npm install` |
| `chsql` (DuckDB extension) | ClickHouse SQL function compat   | Small (lazy-downloaded by DuckDB on first use)                | Automatic     |
| `node-sql-parser`          | Extract table name from user SQL | ~150K                                                         | `npm install` |

All dependencies run on the Node.js side only. None are bundled into workerd.

DuckDB should be an **optional dependency** — only needed when analytics engine datasets are configured. If not installed, `writeDataPoint()` still works (writes CSV), but queries return a clear error asking the user to install DuckDB.

## Testing

Following the repo's established testing tiers:

### Tier 1: Miniflare Plugin Unit Tests

**Location:** `packages/miniflare/test/plugins/analytics-engine/index.spec.ts`

Uses `miniflareTest()` to spin up a real Miniflare instance. Tests exercise the full write→read roundtrip: write data points, then query them via the SQL endpoint or binding.

**SQL query tests (via HTTP endpoint):**

- **Basic SELECT** — Write data points, query `SELECT * FROM dataset`, verify all columns returned
- **WHERE filtering** — `WHERE index1 = 'x'` returns only matching rows
- **Aggregations** — `SUM(double1)`, `COUNT(*)`, `AVG(double2)` return correct values
- **GROUP BY** — Grouping by blob columns produces correct groups
- **ORDER BY / LIMIT** — Results are ordered and limited correctly
- **Subqueries** — `SELECT * FROM (SELECT ... FROM dataset GROUP BY ...) WHERE ...` works
- **ClickHouse functions** — `toStartOfInterval`, `intDiv` work via chsql extension
- **Empty dataset** — Query against a dataset with no writes returns empty results
- **Non-existent dataset** — Query against unknown dataset returns a clear error
- **Multiple datasets** — Write to two datasets, query each independently

**Binding tests:**

- **`.json()`** — Returns parsed JSON object matching query results
- **`.text()`** — Returns raw string response
- **`.stream()`** — Returns `ReadableStream<Uint8Array>` with valid data
- **FORMAT clause** — `FORMAT JSONEachRow` and `FORMAT TabSeparated` produce correct output

**Error handling:**

- **Invalid SQL** — Returns error response, does not crash
- **SQL injection via table name** — Rewriting is safe against injection

**Verification approach:** Each test writes known data points using `writeDataPoint()`, calls `POST /cdn-cgi/analytics-engine/flush` to force the write buffer to disk, then queries via `POST /cdn-cgi/analytics-engine/sql` and asserts on the parsed response.

```ts
test("SELECT with GROUP BY returns aggregated results", async () => {
	// Write data points
	await ctx.mf.dispatchFetch("http://localhost/write"); // triggers writeDataPoint

	// Flush buffer to CSV
	await ctx.mf.dispatchFetch(
		"http://localhost/cdn-cgi/analytics-engine/flush",
		{ method: "POST" }
	);

	// Query via HTTP endpoint
	const response = await ctx.mf.dispatchFetch(
		"http://localhost/cdn-cgi/analytics-engine/sql",
		{
			method: "POST",
			body: "SELECT blob1, SUM(double1) as total FROM my_dataset GROUP BY blob1",
		}
	);
	const result = await response.json();
	expect(result).toContainEqual({ blob1: "Seattle", total: 25 });
});
```

### Tier 2: Wrangler E2E Tests

**Location:** `packages/wrangler/e2e/dev.test.ts`

Extend the existing analytics engine E2E test to cover the full write→query cycle:

- Seed a worker that writes data points on fetch
- Run `wrangler dev`, hit the worker endpoint to trigger writes
- Query via `POST /cdn-cgi/analytics-engine/sql` and verify results
- Test with ClickHouse-specific functions (`toStartOfInterval`, etc.)

### Tier 3: Vite Plugin Playground

**Location:** `packages/vite-plugin-cloudflare/playground/bindings/`

Add a test that uses the query binding to read back data written by `writeDataPoint()`.

## Open Questions

1. **FORMAT mapping** — DuckDB's output formats may not exactly match ClickHouse's `FORMAT JSON|JSONEachRow|TabSeparated`. Need to verify and map where necessary.
2. **Response envelope** — Does the production JSON response include metadata (schema, rows_read, etc.) beyond the query results? If so, do we need to match it?
3. **chsql coverage** — The extension implements 100+ functions but may not cover every WAE-supported function. Need to audit the WAE function list against chsql's implementations.
4. **SHOW TABLES** — Production supports `SHOW TABLES` to list datasets. Locally we'd list CSV files in the persist directory. Can be detected as a special case before parsing.
5. **Binding naming** — Is the SQL query binding a separate binding from the write binding (`AnalyticsEngineDataset`), or combined? Production has them separate (write via worker binding, read via HTTP API), so separate bindings makes sense.
6. **DuckDB lifecycle** — Should we keep a single DuckDB instance alive for the duration of `wrangler dev`, or create one per query? A persistent instance avoids re-loading chsql on every query.

## Sources

- [WAE SQL Reference](https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/)
- [WAE SQL Statements](https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/statements/)
- [DuckDB Node.js API](https://duckdb.org/docs/api/nodejs/overview)
- [DuckDB read_csv](https://duckdb.org/docs/data/csv/overview)
- [chsql DuckDB Extension](https://github.com/Query-farm/clickhouse-sql)
- [chsql on DuckDB Community Extensions](https://duckdb.org/community_extensions/extensions/chsql)
- [node-sql-parser GitHub](https://github.com/taozhi8833998/node-sql-parser)
- [@clickhouse/client-web](https://github.com/ClickHouse/clickhouse-js)
