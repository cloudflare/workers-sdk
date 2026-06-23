import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDetectedAgents } from "../agents-skills-install";

/** Directory name used for the installed skill inside each agent's skills dir. */
const SKILL_DIRECTORY_NAME = "cloudflare-workers-local-observability";

/**
 * Guidance printed by `wrangler observability skill` — designed to be read by a
 * coding agent so it can query the captured local-dev trace store directly with
 * SQL instead of guessing the schema each time.
 */
export const OBSERVABILITY_SKILL = `# Querying local Cloudflare Workers dev observability

\`wrangler dev --experimental-observability\` captures every Worker invocation
during local development as structured traces, spans, and console logs, stored
in a local SQLite database. Use the commands below to inspect them. These work
whether or not \`wrangler dev\` is currently running.

## Commands

- \`wrangler observability logs --last N\`        Most recent N console logs (default 10). \`--level error\` to filter.
- \`wrangler observability traces --last N\`       Most recent N invocations as CSV (default 20).
- \`wrangler observability trace <trace_id>\`      All spans of one trace as CSV.
- \`wrangler observability query "<SQL>"\`          Run read-only SQL against the store (CSV; \`--json\` for JSON).
- \`wrangler observability skill\`                  Print this guidance.

All commands accept \`--persist-to <dir>\` (use the same value you passed to
\`wrangler dev\`) and \`--json\`.

## When to use \`query\`

Prefer \`query\` for anything non-trivial: it is read-only SQL, so you can select
exactly the columns you need, aggregate, filter, and join — pulling only the
relevant data instead of dumping everything. Times are epoch milliseconds.

## Schema

\`\`\`sql
-- One row per span; the root span of an invocation has parent_span_id IS NULL.
traces(
  trace_id TEXT, root_span_id TEXT, parent_span_id TEXT, name TEXT,
  start_ms REAL, end_ms REAL, duration_ms REAL,
  outcome TEXT,        -- 'ok' | 'exception' | 'exceededCpu' | 'canceled' | ...
  status_code INTEGER, -- HTTP status for fetch invocations
  error TEXT,          -- error message if the invocation threw
  span_count INTEGER,  -- total spans in the whole trace
  created_at TEXT
)

-- Individual operations within an invocation (subrequests, KV/D1/R2/DO calls).
spans(
  trace_id TEXT, span_id TEXT, parent_id TEXT, name TEXT,
  kind TEXT,           -- 'http' | 'fetch' | 'kv' | 'd1' | 'r2' | 'do' | 'jsrpc' | ...
  start_ms REAL, end_ms REAL, duration_ms REAL,
  outcome TEXT, error TEXT,
  attributes TEXT      -- JSON string of span attributes
)

-- console.* output captured during an invocation.
logs(
  trace_id TEXT, span_id TEXT, seq INTEGER, ts_ms REAL,
  level TEXT,          -- 'error' | 'warn' | 'info' | 'log' | 'debug'
  message TEXT,        -- JSON array of the original console arguments
  operation TEXT,      -- the invocation the log came from (e.g. 'GET /foo')
  created_at TEXT
)
\`\`\`

## Example queries

\`\`\`sql
-- Recent failed invocations
SELECT trace_id, name, status_code, error
FROM traces
WHERE parent_span_id IS NULL
  AND (status_code >= 500 OR error IS NOT NULL OR outcome != 'ok')
ORDER BY start_ms DESC LIMIT 20;

-- Slowest endpoints (averaged)
SELECT name, COUNT(*) AS n,
       ROUND(AVG(duration_ms),1) AS avg_ms,
       ROUND(MAX(duration_ms),1) AS max_ms
FROM traces WHERE parent_span_id IS NULL
GROUP BY name ORDER BY avg_ms DESC LIMIT 20;

-- All spans of one trace (the waterfall)
SELECT name, kind, ROUND(duration_ms,1) AS ms, outcome, error
FROM spans WHERE trace_id = '<trace_id>' ORDER BY start_ms;

-- Error logs with their originating invocation
SELECT ts_ms, operation, message
FROM logs WHERE level = 'error' ORDER BY ts_ms DESC LIMIT 50;

-- Which invocations make the most subrequests?
SELECT t.name, COUNT(*) AS fetches
FROM spans s JOIN traces t
  ON t.trace_id = s.trace_id AND t.parent_span_id IS NULL
WHERE s.kind = 'fetch'
GROUP BY t.trace_id ORDER BY fetches DESC LIMIT 20;
\`\`\`
`;

/**
 * The skill as an agent-installable `SKILL.md`: YAML frontmatter (so agents
 * index it and know when to use it) followed by the guidance body above.
 */
function skillMarkdown(): string {
	return `---
name: ${SKILL_DIRECTORY_NAME}
description: >-
  Inspect local Cloudflare Workers dev traces, spans, and console logs captured
  by \`wrangler dev --experimental-observability\`. Use when debugging a local
  Worker: find recent errors, slow requests, inspect a specific trace, or run
  read-only SQL against the trace store with the \`wrangler observability\` CLI.
---

${OBSERVABILITY_SKILL}`;
}

export interface InstalledSkill {
	/** Display name of the agent the skill was installed for. */
	agent: string;
	/** Absolute path of the written SKILL.md. */
	path: string;
}

/**
 * Install the observability skill into every detected AI agent's global skills
 * directory, reusing the same agent detection as `wrangler --install-skills`.
 * Returns the agents the skill was written for (empty if none detected).
 */
export async function installObservabilitySkill(): Promise<InstalledSkill[]> {
	const agents = await getDetectedAgents();
	const markdown = skillMarkdown();
	const installed: InstalledSkill[] = [];
	for (const agent of agents) {
		const file = path.join(
			agent.rosie.globalPath,
			SKILL_DIRECTORY_NAME,
			"SKILL.md"
		);
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, markdown);
		installed.push({ agent: agent.name, path: file });
	}
	return installed;
}
