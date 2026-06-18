/**
 * trace-collector — a streaming-tail consumer that (1) prints a trace WATERFALL
 * (gantt-style, colored bars) for every request handled by the worker it's
 * attached to (wobs-trace-demo), and (2) PERSISTS each trace to a local D1 store
 * so traces survive across requests/sessions and can be queried after the fact.
 *
 * Prototype: lives in user-space (a normal tailStream worker) so it proves the
 * concept without changing wrangler. The real product would register a consumer
 * like this inside `wrangler dev` automatically.
 *
 * It is a WorkerEntrypoint (not a plain default export) so it has `this.env`
 * (the TRACES D1 binding) and `this.ctx` (for waitUntil) — the plain
 * `tailStream(event)` form receives neither.
 *
 * Set DEBUG = true to dump every raw event.
 */

import { WorkerEntrypoint } from "cloudflare:workers";

const DEBUG = false;

// ---- terminal styling -------------------------------------------------------
const C = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	gray: "\x1b[38;5;245m",
	orange: "\x1b[38;5;208m",
	blue: "\x1b[38;5;39m",
	cyan: "\x1b[38;5;43m",
	green: "\x1b[38;5;42m",
	red: "\x1b[38;5;203m",
	white: "\x1b[38;5;252m",
};

const NAME_W = 30; // width of the name column
const BAR_W = 44; // width of the gantt area

export default class TraceCollector extends WorkerEntrypoint {
	tailStream(onset) {
		if (DEBUG) console.log("ONSET", JSON.stringify(onset, replacer, 2));

		const rootId = onset.event.spanId;
		const traceId = onset.spanContext?.traceId;
		const spans = new Map();
		const order = [];
		// persistence needs env/ctx — capture from the entrypoint instance
		const env = this.env;
		const ctx = this.ctx;

		spans.set(rootId, {
			id: rootId,
			parentId: onset.spanContext?.spanId,
			name: describeOnset(onset.event),
			kind: "http",
			start: toMs(onset.timestamp),
			end: undefined,
			outcome: undefined,
			error: undefined,
			statusCode: undefined,
			attrs: attrListToObj(onset.event.attributes),
			logs: [],
		});
		order.push(rootId);

		return (e) => {
			if (DEBUG) console.log("EVENT", JSON.stringify(e, replacer, 2));
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
						end: undefined,
						outcome: undefined,
						error: undefined,
						statusCode: undefined,
						attrs: infoToAttrs(ev.info),
						logs: [],
					});
					order.push(ev.spanId);
					break;
				case "spanClose": {
					const s = spans.get(ctxSpanId);
					if (s) {
						s.end = toMs(e.timestamp);
						s.outcome = ev.outcome;
					}
					break;
				}
				case "attributes": {
					// late-arriving attributes for the current span (e.g. D1 query text)
					const s = spans.get(ctxSpanId) ?? spans.get(rootId);
					if (s) s.attrs = { ...(s.attrs ?? {}), ...attrListToObj(ev.info) };
					break;
				}
				case "return": {
					// HTTP status (and other return info) for the root invocation
					const r = spans.get(rootId);
					if (r && ev.info?.type === "fetch") r.statusCode = ev.info.statusCode;
					break;
				}
				case "log": {
					const s = spans.get(ctxSpanId) ?? spans.get(rootId);
					if (s) s.logs.push({ level: ev.level, msg: cleanMsg(ev.message) });
					break;
				}
				case "exception": {
					const s = spans.get(ctxSpanId) ?? spans.get(rootId);
					if (s) s.error = `${ev.name}: ${ev.message}`;
					break;
				}
				case "outcome": {
					const r = spans.get(rootId);
					if (r) {
						r.end = toMs(e.timestamp);
						r.outcome = ev.outcome;
					}
					render(spans, order, rootId, traceId);
					// persist the completed trace; don't block the tail callback
					if (env?.TRACES) {
						ctx.waitUntil(
							persistTrace(env.TRACES, spans, order, rootId, traceId).catch((err) =>
								console.log(`${C.red}trace-collector: persist failed: ${err?.message ?? err}${C.reset}`),
							),
						);
					}
					break;
				}
				default:
					break;
			}
		};
	}
}

// ---- persistence ------------------------------------------------------------

async function persistTrace(db, spans, order, rootId, traceId) {
	const root = spans.get(rootId);
	if (!root) return;
	const t0 = root.start;
	const tid = traceId ?? rootId;
	const total = (root.end ?? t0) - t0;

	const stmts = [];
	stmts.push(
		db
			.prepare(
				`INSERT OR REPLACE INTO traces
				 (trace_id, root_span_id, name, start_ms, end_ms, duration_ms, outcome, status_code, error, span_count)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				tid,
				rootId,
				root.name ?? null,
				0,
				round(total),
				round(total),
				root.outcome ?? null,
				root.statusCode ?? null,
				root.error ?? null,
				order.length,
			),
	);

	for (const id of order) {
		const s = spans.get(id);
		if (!s) continue;
		const dur = s.end != null ? s.end - s.start : total - (s.start - t0);
		stmts.push(
			db
				.prepare(
					`INSERT OR REPLACE INTO spans
					 (trace_id, span_id, parent_id, name, kind, start_ms, end_ms, duration_ms, outcome, error, attributes)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.bind(
					tid,
					s.id,
					s.parentId ?? null,
					s.name ?? null,
					s.kind ?? null,
					round(s.start - t0),
					s.end != null ? round(s.end - t0) : null,
					round(dur),
					s.outcome ?? null,
					s.error ?? null,
					s.attrs ? JSON.stringify(s.attrs) : null,
				),
		);
	}

	await db.batch(stmts);
}

const round = (n) => Math.round((n ?? 0) * 100) / 100;

// ---- attribute extraction ---------------------------------------------------

// SpanOpen.info may be a fetch descriptor or an Attributes bag.
function infoToAttrs(info) {
	if (!info) return undefined;
	if (info.type === "fetch") {
		return { "http.method": info.method, "http.url": info.url };
	}
	if (info.type === "attributes") {
		return attrListToObj(info.info);
	}
	return undefined;
}

// Attribute[] -> plain object (stringify bigints, keep arrays)
function attrListToObj(list) {
	if (!Array.isArray(list) || list.length === 0) return undefined;
	const o = {};
	for (const a of list) {
		if (!a || a.name == null) continue;
		o[a.name] = normalizeAttrValue(a.value);
	}
	return Object.keys(o).length ? o : undefined;
}

function normalizeAttrValue(v) {
	if (typeof v === "bigint") return v.toString();
	if (Array.isArray(v)) return v.map((x) => (typeof x === "bigint" ? x.toString() : x));
	return v;
}

// ---- rendering (unchanged) --------------------------------------------------

function render(spans, order, rootId, traceId) {
	const root = spans.get(rootId);
	if (!root) return;

	const t0 = root.start;
	const total = Math.max(1, (root.end ?? t0) - t0);

	// children grouped by parent (fallback to root)
	const childrenOf = new Map();
	for (const id of order) {
		if (id === rootId) continue;
		const s = spans.get(id);
		let p = s.parentId;
		if (!p || !spans.has(p)) p = rootId;
		if (!childrenOf.has(p)) childrenOf.set(p, []);
		childrenOf.get(p).push(id);
	}

	const out = [];
	const ok = !root.outcome || root.outcome === "ok";
	const head = ok ? C.green : C.red;
	out.push("");
	out.push(
		`${C.bold}${head}\u25b6 ${root.name}${C.reset}  ${C.gray}${Math.round(total)}ms \u00b7 ${root.outcome ?? "?"}${root.statusCode ? " \u00b7 " + root.statusCode : ""}${traceId ? " \u00b7 " + traceId.slice(0, 12) : ""}${C.reset}`,
	);
	// time axis
	const maxLabel = `${Math.round(total)}ms`;
	out.push(
		`${" ".repeat(NAME_W + 1)}${C.gray}0ms${" ".repeat(Math.max(1, BAR_W - 3 - maxLabel.length))}${maxLabel}${C.reset}`,
	);

	const walk = (id, depth) => {
		const s = spans.get(id);
		const col = colorFor(s);
		const dur = s.end != null ? s.end - s.start : total - (s.start - t0);
		const offset = s.start - t0;

		// name column: indent + tag + name, padded to NAME_W (plain text)
		const tag = TAG[s.kind] ?? "";
		const cellPlain = `${"  ".repeat(depth)}${tag ? tag + " " : ""}${s.name}`;
		const cell = pad(cellPlain, NAME_W);

		out.push(
			`${cell} ${bar(offset, dur, total, col)} ${col}${Math.round(dur)}ms${C.reset}${s.error || (s.outcome && s.outcome !== "ok") ? `  ${C.red}\u2717${C.reset}` : ""}`,
		);
		if (s.error) out.push(`${" ".repeat(NAME_W + 1)}${C.red}! ${s.error}${C.reset}`);
		for (const k of childrenOf.get(id) ?? []) walk(k, depth + 1);
	};
	walk(rootId, 0);

	// logs (cleaned, dimmed) below the waterfall
	const logs = [];
	for (const id of order) {
		const s = spans.get(id);
		for (const l of s.logs) logs.push(l);
	}
	if (logs.length) {
		out.push(`${C.gray}  logs${C.reset}`);
		for (const l of logs) {
			const lv = l.level === "error" || l.level === "warn" ? C.red : C.gray;
			out.push(`  ${lv}\u00b7 ${l.msg}${C.reset}`);
		}
	}
	out.push("");
	console.log(out.join("\n"));
}

// gantt bar: leading offset spaces, colored block of length=duration
function bar(offset, dur, total, color) {
	let off = Math.round((offset / total) * BAR_W);
	off = Math.max(0, Math.min(off, BAR_W - 1));
	let len = Math.round((dur / total) * BAR_W);
	len = Math.max(1, Math.min(len, BAR_W - off));
	const trail = BAR_W - off - len;
	return `${C.dim}${"\u00b7".repeat(off)}${C.reset}${color}${"\u2588".repeat(len)}${C.reset}${" ".repeat(Math.max(0, trail))}`;
}

const TAG = { http: "HTTP", kv: "KV", d1: "D1", fetch: "fetch", r2: "R2", do: "DO" };

function kindOf(name) {
	const n = (name || "").toLowerCase();
	if (n.includes("kv")) return "kv";
	if (n.includes("d1")) return "d1";
	if (n.includes("fetch")) return "fetch";
	if (n.includes("r2")) return "r2";
	return "span";
}

function colorFor(s) {
	if (s.error || (s.outcome && s.outcome !== "ok")) return C.red;
	switch (s.kind) {
		case "http":
			return C.orange;
		case "kv":
			return C.blue;
		case "d1":
			return C.cyan;
		case "fetch":
			return C.green;
		default:
			return C.gray;
	}
}

function pad(s, w) {
	if (s.length > w) return s.slice(0, w - 1) + "\u2026";
	return s + " ".repeat(w - s.length);
}

function describeOnset(onsetEvent) {
	const info = onsetEvent.info;
	if (info && info.type === "fetch") {
		let path = info.url;
		try {
			path = new URL(info.url).pathname;
		} catch {}
		return `${info.method} ${path}`;
	}
	return (info && info.type) || onsetEvent.scriptName || "request";
}

const toMs = (t) =>
	t == null
		? Date.now()
		: typeof t === "number"
			? t
			: t instanceof Date
				? t.getTime()
				: new Date(t).getTime();

// strip ANSI + flatten arrays/objects from captured console.log messages
function cleanMsg(m) {
	const strip = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, "");
	if (Array.isArray(m)) return m.map(strip).join(" ");
	if (typeof m === "string") return strip(m);
	try {
		return strip(JSON.stringify(m, replacer));
	} catch {
		return String(m);
	}
}

function replacer(_key, value) {
	return typeof value === "bigint" ? value.toString() : value;
}
