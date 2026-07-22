/**
 * A tiny `key:value` query language for the Observability search bars.
 *
 * Supported (AND-only):
 *   status:error|success        kind:d1|http|fetch|kv|r2|do
 *   dur:>100  dur:<=50          <attr>:<value>   (e.g. db.query.text:orders)
 *   level:error  op:/checkout   (Logs)
 * Any bare words (or quoted "phrases") become free-text search.
 */

/**
 * The operator set offered by the filter builder, mirroring the production
 * Workers Observability query builder (`QueryOperation`). String keys get
 * substring/prefix/equality operators; numeric keys get comparators; presence
 * operators apply to attribute keys that may be absent.
 */
export type ClauseOp =
	| "~" // contains       (LIKE %v%)
	| "!~" // does not contain
	| "="
	| "!="
	| "^" // starts with     (LIKE v%)
	| ">"
	| ">="
	| "<"
	| "<="
	| "exists"
	| "!exists";

/** The value types a filterable field can have (local data is string/number). */
export type ClauseType = "string" | "number";

/** A single structured clause parsed from the query bar or built in the modal. */
export interface QueryClause {
	/** "duration" (numeric, on the trace) or a span attribute / log column key. */
	field: string;
	/** comparator; see {@link ClauseOp}. */
	op: ClauseOp;
	value: string;
}

/** Metadata for a single operator: label, applicable types, value requirement. */
export interface ClauseOperator {
	op: ClauseOp;
	label: string;
	types: ReadonlyArray<ClauseType>;
	/** Whether the operator takes a value (presence operators do not). */
	needsValue: boolean;
}

/** All operators, in display order (mirrors the dashboard's operator list). */
export const CLAUSE_OPERATORS: ReadonlyArray<ClauseOperator> = [
	{ op: "~", label: "contains", types: ["string"], needsValue: true },
	{ op: "!~", label: "does not contain", types: ["string"], needsValue: true },
	{ op: "=", label: "equals", types: ["string", "number"], needsValue: true },
	{
		op: "!=",
		label: "does not equal",
		types: ["string", "number"],
		needsValue: true,
	},
	{ op: "^", label: "starts with", types: ["string"], needsValue: true },
	{ op: ">", label: "greater than", types: ["number"], needsValue: true },
	{ op: ">=", label: "greater or equal", types: ["number"], needsValue: true },
	{ op: "<", label: "less than", types: ["number"], needsValue: true },
	{ op: "<=", label: "less or equal", types: ["number"], needsValue: true },
	{ op: "exists", label: "exists", types: ["string"], needsValue: false },
	{
		op: "!exists",
		label: "does not exist",
		types: ["string"],
		needsValue: false,
	},
];

/** Operators applicable to a given field type, in display order. */
export function operatorsForType(
	type: ClauseType
): ReadonlyArray<ClauseOperator> {
	return CLAUSE_OPERATORS.filter((o) => o.types.includes(type));
}

/** The default operator for a field type (contains for strings, > for numbers). */
export function defaultOpForType(type: ClauseType): ClauseOp {
	return type === "number" ? ">" : "~";
}

/** Human-readable label for an operator (e.g. "contains", ">="). */
export function clauseOpLabel(op: ClauseOp): string {
	return CLAUSE_OPERATORS.find((o) => o.op === op)?.label ?? op;
}

/** Whether an operator requires a value input. */
export function clauseOpNeedsValue(op: ClauseOp): boolean {
	return CLAUSE_OPERATORS.find((o) => o.op === op)?.needsValue ?? true;
}

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
				// Bare `attr:value` from the search bar is a substring match.
				result.clauses.push({ field: kv.key, op: "~", value: kv.value });
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
