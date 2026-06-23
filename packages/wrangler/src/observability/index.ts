import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import { stripDevRunnerSpans, traceDurationMs } from "./dev-runner";
import { installObservabilitySkill, OBSERVABILITY_SKILL } from "./skill";
import {
	clampLimit,
	formatLogLine,
	openTraceStore,
	runReadQuery,
	toCsv,
	toJson,
} from "./store";
import type { QueryResult, SqlRow, TraceStore } from "./store";

/** Hide Vite dev module-runner plumbing spans by default; flag to keep them. */
const includeRunnerSpansArg = {
	"include-runner-spans": {
		type: "boolean",
		description:
			"Include Vite dev module-runner plumbing spans (hidden by default)",
		default: false,
	},
} as const;

const OWNER = "Workers: Workers Observability";

/** Shared args for every command that reads the local trace store. */
const storeArgs = {
	"persist-to": {
		type: "string",
		description:
			"Directory used for local persistence (use the same value as `wrangler dev`)",
		requiresArg: true,
	},
	json: {
		type: "boolean",
		description: "Output as JSON",
		default: false,
	},
} as const;

const noBanner = { printBanner: false, printResourceLocation: false } as const;

/** Print a query result as CSV (default) or JSON. */
function output(result: QueryResult, json: boolean): void {
	if (json) {
		logger.log(toJson(result));
		return;
	}
	if (result.rows.length === 0) {
		logger.log("(no rows)");
		return;
	}
	logger.log(toCsv(result));
}

const TRACE_LIST_COLUMNS = [
	"trace_id",
	"name",
	"status_code",
	"outcome",
	"duration_ms",
	"span_count",
	"error",
];

export const observabilityNamespace = createNamespace({
	metadata: {
		description:
			"🔭 Inspect local-dev traces & logs captured by `wrangler dev`",
		status: "experimental",
		owner: OWNER,
		category: "Compute & AI",
	},
});

export const observabilityLogsCommand = createCommand({
	metadata: {
		description: "Print the most recent captured console logs",
		status: "experimental",
		owner: OWNER,
	},
	behaviour: noBanner,
	args: {
		last: {
			type: "number",
			description: "How many logs to show",
			default: 10,
		},
		level: {
			type: "string",
			description:
				"Only show logs at this level (error, warn, info, log, debug)",
			requiresArg: true,
		},
		...storeArgs,
	},
	async handler(args, { config }) {
		const store = await openTraceStore(config, args.persistTo);
		try {
			const filter = args.level ? "WHERE level = ?" : "";
			const params = args.level ? [args.level] : [];
			const result = runReadQuery(
				store,
				`SELECT ts_ms, level, message, operation, trace_id FROM logs ${filter} ORDER BY ts_ms DESC LIMIT ?`,
				[...params, clampLimit(args.last, 10)]
			);
			// Fetched newest-first for the LIMIT; show oldest-first like `tail`.
			result.rows.reverse();

			if (args.json) {
				logger.log(toJson(result));
			} else if (result.rows.length === 0) {
				logger.log("No logs captured yet.");
			} else {
				for (const row of result.rows) {
					logger.log(formatLogLine(row));
				}
			}
		} finally {
			store.db.close();
		}
	},
});

export const observabilityTracesCommand = createCommand({
	metadata: {
		description: "Print high-level summaries of the most recent traces",
		status: "experimental",
		owner: OWNER,
	},
	behaviour: noBanner,
	args: {
		last: {
			type: "number",
			description: "How many traces to show",
			default: 20,
		},
		...includeRunnerSpansArg,
		...storeArgs,
	},
	async handler(args, { config }) {
		const store = await openTraceStore(config, args.persistTo);
		try {
			// One row per distributed trace (the parent-less root invocation).
			const roots = runReadQuery(
				store,
				`SELECT trace_id, name, status_code, outcome, error
				 FROM traces
				 WHERE parent_span_id IS NULL
				 ORDER BY start_ms DESC
				 LIMIT ?`,
				[clampLimit(args.last, 20)]
			);
			if (roots.rows.length === 0) {
				output({ columns: TRACE_LIST_COLUMNS, rows: [] }, args.json);
				return;
			}

			// Fetch the spans for those traces so span_count/duration can exclude
			// Vite dev-runner plumbing (computed in JS rather than via SQL).
			const traceIds = roots.rows.map((r) => String(r.trace_id));
			const placeholders = traceIds.map(() => "?").join(",");
			const spans = runReadQuery(
				store,
				`SELECT trace_id, span_id, parent_id, name, attributes, start_ms, end_ms
				 FROM spans WHERE trace_id IN (${placeholders})`,
				traceIds
			).rows;

			const spansByTrace = new Map<string, SqlRow[]>();
			for (const span of spans) {
				const id = String(span.trace_id);
				const list = spansByTrace.get(id) ?? [];
				list.push(span);
				spansByTrace.set(id, list);
			}

			const rows: SqlRow[] = roots.rows.map((r) => {
				const all = spansByTrace.get(String(r.trace_id)) ?? [];
				const counted = args.includeRunnerSpans
					? all
					: stripDevRunnerSpans(all);
				return {
					trace_id: r.trace_id,
					name: r.name,
					status_code: r.status_code,
					outcome: r.outcome,
					duration_ms: traceDurationMs(all),
					span_count: counted.length,
					error: r.error,
				};
			});
			output({ columns: TRACE_LIST_COLUMNS, rows }, args.json);
		} finally {
			store.db.close();
		}
	},
});

export const observabilityTraceCommand = createCommand({
	metadata: {
		description: "Print all spans of a single trace",
		status: "experimental",
		owner: OWNER,
	},
	behaviour: noBanner,
	args: {
		"trace-id": {
			type: "string",
			demandOption: true,
			description:
				"The trace_id to inspect (from `wrangler observability traces`)",
		},
		...includeRunnerSpansArg,
		...storeArgs,
	},
	positionalArgs: ["trace-id"],
	async handler(args, { config }) {
		const store = await openTraceStore(config, args.persistTo);
		try {
			const result = runReadQuery(
				store,
				`SELECT span_id, parent_id, name, kind,
				        ROUND(duration_ms, 1) AS duration_ms, outcome, error, attributes
				 FROM spans
				 WHERE trace_id = ?
				 ORDER BY start_ms ASC`,
				[args.traceId]
			);
			if (result.rows.length === 0) {
				logger.log(`No spans found for trace ${args.traceId}.`);
				return;
			}
			const rows = args.includeRunnerSpans
				? result.rows
				: stripDevRunnerSpans(result.rows);
			output({ columns: result.columns, rows }, args.json);
		} finally {
			store.db.close();
		}
	},
});

export const observabilityQueryCommand = createCommand({
	metadata: {
		description: "Run a read-only SQL query against the captured trace store",
		status: "experimental",
		owner: OWNER,
		epilogue:
			"Run `wrangler observability skill` to print the schema and example queries.",
	},
	behaviour: noBanner,
	args: {
		sql: {
			type: "string",
			demandOption: true,
			description:
				'A read-only SQL query (e.g. "SELECT * FROM traces LIMIT 5")',
		},
		...storeArgs,
	},
	positionalArgs: ["sql"],
	async handler(args, { config }) {
		const store: TraceStore = await openTraceStore(config, args.persistTo);
		try {
			output(runReadQuery(store, args.sql), args.json);
		} finally {
			store.db.close();
		}
	},
});

export const observabilitySkillCommand = createCommand({
	metadata: {
		description:
			"Print guidance (commands, schema, example queries) for an agent",
		status: "experimental",
		owner: OWNER,
	},
	behaviour: noBanner,
	args: {
		install: {
			type: "boolean",
			description:
				"Install this skill into detected AI agents' global skills directories (instead of printing it)",
			default: false,
		},
	},
	async handler(args) {
		if (!args.install) {
			logger.log(OBSERVABILITY_SKILL);
			return;
		}

		const installed = await installObservabilitySkill();
		if (installed.length === 0) {
			logger.log(
				"No supported AI coding agents detected. Run `wrangler observability skill` (without --install) to print the guidance instead."
			);
			return;
		}
		logger.log(
			`Installed the local observability skill for: ${installed.map((i) => i.agent).join(", ")}.`
		);
		for (const { path } of installed) {
			logger.log(`  ${path}`);
		}
	},
});
