import type { QueryClause } from "./traces";

/**
 * A tiny `key:value` query language for the Observability search bars.
 *
 * Supported (AND-only):
 *   status:error|success        kind:d1|http|fetch|kv|r2|do
 *   dur:>100  dur:<=50          <attr>:<value>   (e.g. db.query.text:orders)
 *   level:error  op:/checkout   (Events)
 * Any bare words (or quoted "phrases") become free-text search.
 */

const COMPARATORS = [">=", "<=", ">", "<", "="] as const;
type Comparator = (typeof COMPARATORS)[number];

function tokenize(input: string): string[] {
	const tokens: string[] = [];
	const re = /"[^"]*"|\S+/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(input)) !== null) {
		tokens.push(m[0]);
	}
	return tokens;
}

function unquote(s: string): string {
	return s.length >= 2 && s.startsWith('"') && s.endsWith('"')
		? s.slice(1, -1)
		: s;
}

function splitComparator(v: string): { op: Comparator; value: string } {
	for (const c of COMPARATORS) {
		if (v.startsWith(c)) {
			return { op: c, value: v.slice(c.length) };
		}
	}
	return { op: "=", value: v };
}

/** A token of the form `key:value`, or null if it's just free text. */
function splitToken(token: string): { key: string; value: string } | null {
	const idx = token.indexOf(":");
	if (idx <= 0) {
		return null;
	}
	const value = unquote(token.slice(idx + 1));
	if (!value) {
		return null;
	}
	return { key: token.slice(0, idx).toLowerCase(), value };
}

export interface ParsedTraceQuery {
	text: string;
	status?: "success" | "error";
	kind?: string;
	clauses: QueryClause[];
}

export function parseTraceQuery(input: string): ParsedTraceQuery {
	const result: ParsedTraceQuery = { text: "", clauses: [] };
	const free: string[] = [];

	for (const token of tokenize(input.trim())) {
		const kv = splitToken(token);
		if (!kv) {
			free.push(unquote(token));
			continue;
		}
		switch (kv.key) {
			case "status": {
				const v = kv.value.toLowerCase();
				if (v === "error" || v === "err" || v === "fail") {
					result.status = "error";
				} else if (v === "success" || v === "ok" || v === "200") {
					result.status = "success";
				}
				break;
			}
			case "kind":
			case "type":
				result.kind = kv.value.toLowerCase();
				break;
			case "dur":
			case "duration": {
				const { op, value } = splitComparator(kv.value);
				result.clauses.push({ field: "duration", op, value });
				break;
			}
			default:
				result.clauses.push({ field: kv.key, op: "=", value: kv.value });
		}
	}

	result.text = free.join(" ");
	return result;
}

export interface ParsedEventQuery {
	text: string;
	level?: string;
	operation?: string;
}

export function parseEventQuery(input: string): ParsedEventQuery {
	const result: ParsedEventQuery = { text: "" };
	const free: string[] = [];

	for (const token of tokenize(input.trim())) {
		const kv = splitToken(token);
		if (!kv) {
			free.push(unquote(token));
			continue;
		}
		if (kv.key === "level" || kv.key === "lvl") {
			result.level = kv.value.toLowerCase();
		} else if (
			kv.key === "op" ||
			kv.key === "operation" ||
			kv.key === "route"
		) {
			result.operation = kv.value;
		} else {
			free.push(token);
		}
	}

	result.text = free.join(" ");
	return result;
}
