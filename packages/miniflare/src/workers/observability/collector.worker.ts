/**
 * Local observability collector (experimental).
 *
 * Injected automatically when local observability is enabled
 * (`X_LOCAL_OBSERVABILITY`). It is registered as a streaming-tail consumer for
 * the user's worker(s): workerd streams TailStream events here, and this worker
 * persists each completed trace (plus its spans and logs) to an internal local
 * D1 database that the Local Explorer's Observability tab reads.
 *
 * No user config, no terminal rendering — capture + persist only. The schema is
 * created lazily so there is nothing to seed.
 */
import { WorkerEntrypoint } from "cloudflare:workers";

interface Env {
	// Internal D1 provisioned by wrangler dev for the trace store.
	WOBS_TRACES: D1Database;
}

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS traces (
		trace_id TEXT NOT NULL, root_span_id TEXT NOT NULL, name TEXT,
		start_ms REAL, end_ms REAL, duration_ms REAL, outcome TEXT,
		status_code INTEGER, error TEXT, span_count INTEGER,
		created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (trace_id, root_span_id))`,
	`CREATE TABLE IF NOT EXISTS spans (
		trace_id TEXT NOT NULL, span_id TEXT NOT NULL, parent_id TEXT, name TEXT, kind TEXT,
		start_ms REAL, end_ms REAL, duration_ms REAL, outcome TEXT, error TEXT, attributes TEXT,
		PRIMARY KEY (trace_id, span_id))`,
	`CREATE TABLE IF NOT EXISTS logs (
		trace_id TEXT NOT NULL, span_id TEXT, seq INTEGER NOT NULL, ts_ms REAL,
		level TEXT, message TEXT, operation TEXT,
		created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (trace_id, seq))`,
];

type Span = {
	id: string;
	parentId?: string;
	name: string;
	kind: string;
	start: number;
	end?: number;
	outcome?: string;
	error?: string;
	statusCode?: number;
	attrs?: Record<string, unknown>;
	logs: Array<{ level: string; message: unknown; ts: number }>;
};

export default class LocalObservabilityCollector extends WorkerEntrypoint<Env> {
	tailStream(onset: TailStream.TailEvent<TailStream.Onset>) {
		const rootId = onset.event.spanId;
		const traceId = onset.spanContext?.traceId ?? rootId;
		const spans = new Map<string, Span>();
		const order: string[] = [];
		const env = this.env;
		const ctx = this.ctx;

		spans.set(rootId, {
			id: rootId,
			parentId: onset.spanContext?.spanId,
			name: describeOnset(onset.event),
			kind: onsetKind(onset.event.info),
			start: toMs(onset.timestamp),
			attrs: onsetAttributes(onset.event),
			logs: [],
		});
		order.push(rootId);

		return (e: TailStream.TailEvent<TailStream.EventType>) => {
			const ev = e.event;
			const ctxSpanId = e.spanContext?.spanId;
			switch (ev.type) {
				case "spanOpen":
					spans.set(ev.spanId, {
						id: ev.spanId,
						parentId: ctxSpanId,
						name: ev.name,
						kind: kindOf(ev.name),
						start: toMs(e.timestamp),
						attrs: infoToAttrs(ev.info),
						logs: [],
					});
					order.push(ev.spanId);
					break;
				case "spanClose": {
					const s = ctxSpanId && spans.get(ctxSpanId);
					if (s) {
						s.end = toMs(e.timestamp);
						s.outcome = ev.outcome;
					}
					break;
				}
				case "attributes": {
					const s = spans.get(ctxSpanId ?? rootId);
					if (s) s.attrs = { ...(s.attrs ?? {}), ...attrListToObj(ev.info) };
					break;
				}
				case "return": {
					const r = spans.get(rootId);
					if (r && ev.info?.type === "fetch") r.statusCode = ev.info.statusCode;
					break;
				}
				case "log": {
					const s = spans.get(ctxSpanId ?? rootId);
					if (s)
						s.logs.push({
							level: ev.level,
							message: ev.message,
							ts: toMs(e.timestamp),
						});
					break;
				}
				case "exception": {
					const s = spans.get(ctxSpanId ?? rootId);
					if (s) {
						s.error = `${ev.name}: ${ev.message}`;
						if (ev.stack) {
							s.attrs = {
								...(s.attrs ?? {}),
								"exception.stacktrace": ev.stack,
							};
						}
					}
					break;
				}
				case "outcome": {
					const r = spans.get(rootId);
					if (r) {
						r.end = toMs(e.timestamp);
						r.outcome = ev.outcome;
						// Mirror vega: capture CPU/wall time + outcome on the root span.
						r.attrs = {
							...(r.attrs ?? {}),
							"cloudflare.outcome": ev.outcome,
							cpu_time_ms: ev.cpuTime,
							wall_time_ms: ev.wallTime,
						};
					}
					if (env.WOBS_TRACES) {
						ctx.waitUntil(
							persist(env.WOBS_TRACES, spans, order, rootId, traceId).catch(
								(err) =>
									console.error(
										`[observability-collector] persist failed:`,
										err?.stack ?? String(err)
									)
							)
						);
					}
					break;
				}
			}
		};
	}
}

async function persist(
	db: D1Database,
	spans: Map<string, Span>,
	order: string[],
	rootId: string,
	traceId: string
): Promise<void> {
	const root = spans.get(rootId);
	if (!root) return;
	const t0 = root.start;
	const total = (root.end ?? t0) - t0;
	const round = (n: number) => Math.round(n * 100) / 100;

	const stmts: D1PreparedStatement[] = SCHEMA.map((s) => db.prepare(s));

	stmts.push(
		db
			.prepare(
				`INSERT OR REPLACE INTO traces (trace_id, root_span_id, name, start_ms, end_ms, duration_ms, outcome, status_code, error, span_count) VALUES (?,?,?,?,?,?,?,?,?,?)`
			)
			.bind(
				traceId,
				rootId,
				root.name ?? null,
				0,
				round(total),
				round(total),
				root.outcome ?? null,
				root.statusCode ?? null,
				root.error ?? null,
				order.length
			)
	);

	let seq = 0;
	for (const id of order) {
		const s = spans.get(id);
		if (!s) continue;
		const dur = s.end != null ? s.end - s.start : total - (s.start - t0);
		stmts.push(
			db
				.prepare(
					`INSERT OR REPLACE INTO spans (trace_id, span_id, parent_id, name, kind, start_ms, end_ms, duration_ms, outcome, error, attributes) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
				)
				.bind(
					traceId,
					s.id,
					s.parentId ?? null,
					s.name ?? null,
					s.kind ?? null,
					round(s.start - t0),
					s.end != null ? round(s.end - t0) : null,
					round(dur),
					s.outcome ?? null,
					s.error ?? null,
					s.attrs ? safeStringify(s.attrs) : null
				)
		);
		for (const l of s.logs) {
			stmts.push(
				db
					.prepare(
						`INSERT OR REPLACE INTO logs (trace_id, span_id, seq, ts_ms, level, message, operation) VALUES (?,?,?,?,?,?,?)`
					)
					.bind(
						traceId,
						s.id,
						seq,
						round((l.ts ?? t0) - t0),
						l.level ?? "log",
						safeStringify(l.message),
						root.name ?? null
					)
			);
			seq++;
		}
	}

	await db.batch(stmts);
}

function infoToAttrs(
	info: TailStream.SpanOpen["info"]
): Record<string, unknown> | undefined {
	if (!info) return undefined;
	if (info.type === "fetch") {
		return { "http.method": info.method, "http.url": info.url };
	}
	if (info.type === "attributes") return attrListToObj(info.info);
	return undefined;
}

function attrListToObj(
	list: readonly TailStream.Attribute[] | undefined
): Record<string, unknown> | undefined {
	if (!list?.length) return undefined;
	const o: Record<string, unknown> = {};
	for (const a of list) {
		if (a?.name == null) continue;
		o[a.name] = typeof a.value === "bigint" ? a.value.toString() : a.value;
	}
	return Object.keys(o).length ? o : undefined;
}

function kindOf(name: string): string {
	const n = (name || "").toLowerCase();
	if (n.includes("kv")) return "kv";
	if (n.includes("d1")) return "d1";
	if (n.includes("fetch")) return "fetch";
	if (n.includes("r2")) return "r2";
	if (n.includes("do") || n.includes("durable")) return "do";
	return "span";
}

/** Span kind for the root invocation, derived from the trigger type. */
function onsetKind(info: TailStream.Onset["info"]): string {
	switch (info.type) {
		case "fetch":
			return "http";
		case "scheduled":
		case "alarm":
			return "scheduled";
		case "queue":
			return "queue";
		case "email":
			return "email";
		case "trace":
			return "trace";
		case "hibernatableWebSocket":
			return "websocket";
		case "jsrpc":
			return "jsrpc";
		default:
			return "worker";
	}
}

/** Human-readable name for the root invocation span, per trigger type. */
function describeOnset(onset: TailStream.Onset): string {
	const info = onset.info;
	switch (info.type) {
		case "fetch": {
			let path = info.url;
			try {
				path = new URL(info.url).pathname;
			} catch {
				/* keep full url */
			}
			return `${info.method} ${path}`;
		}
		case "scheduled":
			return `scheduled ${info.cron}`;
		case "alarm":
			return "alarm";
		case "queue":
			return `queue ${info.queueName}`;
		case "email":
			return `email ${info.rcptTo}`;
		case "trace":
			return "trace";
		case "hibernatableWebSocket":
			return `websocket ${info.info.type}`;
		case "jsrpc":
			return "jsrpc";
		case "custom":
			return "custom";
		default:
			return onset.scriptName ?? "request";
	}
}

const toIso = (t: Date | number): string =>
	t instanceof Date ? t.toISOString() : new Date(t).toISOString();

/**
 * Build the root-invocation span attributes, mirroring what the production
 * streaming-tail worker (vega's cf-to-otel) ingests: worker metadata plus
 * per-trigger info (cron, queue, email, etc.) and any explicit onset attributes.
 */
function onsetAttributes(onset: TailStream.Onset): Record<string, unknown> {
	const attrs: Record<string, unknown> = {};

	// Worker / invocation metadata.
	if (onset.scriptName) attrs["cloudflare.script_name"] = onset.scriptName;
	if (onset.entrypoint) attrs["cloudflare.entrypoint"] = onset.entrypoint;
	if (onset.executionModel) {
		attrs["cloudflare.execution_model"] = onset.executionModel;
	}
	if (onset.dispatchNamespace) {
		attrs["cloudflare.dispatch_namespace"] = onset.dispatchNamespace;
	}
	if (onset.scriptVersion?.id) {
		attrs["cloudflare.script_version.id"] = onset.scriptVersion.id;
	}
	if (onset.scriptVersion?.tag) {
		attrs["cloudflare.script_version.tag"] = onset.scriptVersion.tag;
	}
	if (onset.scriptVersion?.message) {
		attrs["cloudflare.script_version.message"] = onset.scriptVersion.message;
	}
	if (onset.scriptTags?.length) {
		attrs["cloudflare.script_tags"] = onset.scriptTags.join(",");
	}

	// Per-trigger info.
	const info = onset.info;
	switch (info.type) {
		case "fetch":
			attrs["faas.trigger"] = "http";
			attrs["http.request.method"] = info.method;
			attrs["url.full"] = info.url;
			break;
		case "scheduled":
			attrs["faas.trigger"] = "timer";
			attrs["faas.cron"] = info.cron;
			attrs["cloudflare.scheduled_time"] = toIso(info.scheduledTime);
			break;
		case "alarm":
			attrs["faas.trigger"] = "timer";
			attrs["cloudflare.scheduled_time"] = toIso(info.scheduledTime);
			break;
		case "queue":
			attrs["faas.trigger"] = "pubsub";
			attrs["cloudflare.queue.name"] = info.queueName;
			attrs["cloudflare.queue.batch_size"] = info.batchSize;
			break;
		case "email":
			attrs["faas.trigger"] = "email";
			attrs["cloudflare.email.from"] = info.mailFrom;
			attrs["cloudflare.email.to"] = info.rcptTo;
			attrs["cloudflare.email.size"] = info.rawSize;
			break;
		case "trace":
			attrs["faas.trigger"] = "trace";
			attrs["cloudflare.trace.count"] = info.traces.length;
			break;
		case "hibernatableWebSocket":
			attrs["faas.trigger"] = "websocket";
			break;
		case "jsrpc":
			attrs["faas.trigger"] = "jsrpc";
			break;
	}

	// Explicit onset attributes emitted by the runtime override/extend the above.
	return { ...attrs, ...(attrListToObj(onset.attributes) ?? {}) };
}

function toMs(t: Date | number | null | undefined): number {
	if (t == null) return Date.now();
	if (typeof t === "number") return t;
	return t instanceof Date ? t.getTime() : new Date(t).getTime();
}

function safeStringify(v: unknown): string {
	try {
		return JSON.stringify(v, (_k, val) =>
			typeof val === "bigint" ? val.toString() : val
		);
	} catch {
		return String(v);
	}
}
