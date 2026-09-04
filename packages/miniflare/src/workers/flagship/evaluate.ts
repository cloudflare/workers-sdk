import type { Condition, FlagInput, FlagValue, Rule } from "./flags";

// Vendored from Flagship data-plane commit f32a8bf1607a7493175ea3a919f56dcd6b8a4fca.
// Hashing and matching must remain byte-compatible with production.

export type EvaluationReason =
	| "TARGETING_MATCH"
	| "DEFAULT"
	| "DISABLED"
	| "SPLIT"
	| "ERROR";

export type ErrorCode =
	| "FLAG_NOT_FOUND"
	| "PARSE_ERROR"
	| "TYPE_MISMATCH"
	| "GENERAL";

export type EvaluationContext = Record<string, unknown>;

export type FlagType = "boolean" | "string" | "number" | "object";

export type EvalRule = Omit<Rule, "priority">;
export type EvalFlag = Omit<FlagInput, "rules"> & { rules: EvalRule[] };

export interface EvaluationDetails<T> {
	flagKey: string;
	value: T;
	variant: string;
	reason: EvaluationReason;
	errorCode?: ErrorCode;
	errorMessage?: string;
}

export class TypeCastError extends Error {
	constructor(flagKey: string, expectedType: string, actualValue: unknown) {
		super(
			`Flag '${flagKey}' has type '${typeof actualValue}', expected '${expectedType}'`
		);
		this.name = "TypeCastError";
	}
}

export class FlagConfigError extends Error {
	constructor(flagKey: string, message: string) {
		super(`Flag '${flagKey}' ${message}`);
		this.name = "FlagConfigError";
	}
}

const ISO_8601_REGEX =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const encoder = new TextEncoder();
const randomBuf = new Uint32Array(1);
let hashBuf = new Uint8Array(512);

function murmurhash3(str: string, seed: number): number {
	if (hashBuf.byteLength < str.length * 3) {
		hashBuf = new Uint8Array(str.length * 3);
	}
	const { written: n } = encoder.encodeInto(str, hashBuf);
	const b = hashBuf;
	let h = seed >>> 0;
	let i = 0;
	while (i + 4 <= n) {
		let k = b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
		k = Math.imul(k, 0xcc9e2d51) >>> 0;
		k = ((k << 15) | (k >>> 17)) >>> 0;
		k = Math.imul(k, 0x1b873593) >>> 0;
		h ^= k;
		h = ((h << 13) | (h >>> 19)) >>> 0;
		h = (Math.imul(h, 5) + 0xe6546b64) >>> 0;
		i += 4;
	}
	let k = 0;
	if (n - i >= 3) {
		k ^= b[i + 2] << 16;
	}
	if (n - i >= 2) {
		k ^= b[i + 1] << 8;
	}
	if (n > i) {
		k ^= b[i];
		k = Math.imul(k, 0xcc9e2d51) >>> 0;
		k = ((k << 15) | (k >>> 17)) >>> 0;
		k = Math.imul(k, 0x1b873593) >>> 0;
		h ^= k;
	}
	h ^= n;
	h ^= h >>> 16;
	h = Math.imul(h, 0x85ebca6b) >>> 0;
	h ^= h >>> 13;
	h = Math.imul(h, 0xc2b2ae35) >>> 0;
	h ^= h >>> 16;
	return (h >>> 0) % 100;
}

function compareTemporalOrNumeric(
	attrValue: unknown,
	target: unknown,
	compare: (a: number, b: number) => boolean
): boolean {
	if (
		typeof target === "string" &&
		ISO_8601_REGEX.test(target) &&
		typeof attrValue === "string"
	) {
		const ts = Date.parse(attrValue);
		if (!isNaN(ts)) {
			return compare(ts, Date.parse(target));
		}
	}
	return compare(Number(attrValue), Number(target));
}

function evaluateCondition(
	condition: Condition,
	context: EvaluationContext
): boolean {
	if ("logical_operator" in condition) {
		const { logical_operator, clauses } = condition;
		if (logical_operator === "AND") {
			for (const clause of clauses) {
				if (!evaluateCondition(clause, context)) {
					return false;
				}
			}
			return true;
		}
		for (const clause of clauses) {
			if (evaluateCondition(clause, context)) {
				return true;
			}
		}
		return false;
	}

	const { attribute, operator, value: target } = condition;
	const attrValue = context[attribute];
	if (attrValue === undefined) {
		return false;
	}

	switch (operator) {
		case "equals":
			return String(attrValue) === String(target);
		case "not_equals":
			return String(attrValue) !== String(target);
		case "contains":
			return String(attrValue).includes(String(target));
		case "starts_with":
			return String(attrValue).startsWith(String(target));
		case "ends_with":
			return String(attrValue).endsWith(String(target));
		case "greater_than":
			return compareTemporalOrNumeric(attrValue, target, (a, b) => a > b);
		case "less_than":
			return compareTemporalOrNumeric(attrValue, target, (a, b) => a < b);
		case "greater_than_or_equals":
			return compareTemporalOrNumeric(attrValue, target, (a, b) => a >= b);
		case "less_than_or_equals":
			return compareTemporalOrNumeric(attrValue, target, (a, b) => a <= b);
		case "in":
			return (
				Array.isArray(target) &&
				target.some((value) => String(value) === String(attrValue))
			);
		case "not_in":
			return (
				Array.isArray(target) &&
				!target.some((value) => String(value) === String(attrValue))
			);
		default:
			return false;
	}
}

export function evaluateFlag(
	flagDef: EvalFlag | FlagInput,
	context: EvaluationContext,
	accountId: string
): { value: FlagValue; variant: string; reason: EvaluationReason } {
	const serve = (variant: string, reason: EvaluationReason) => {
		if (!Object.hasOwn(flagDef.variations, variant)) {
			throw new FlagConfigError(
				flagDef.key,
				`variation '${variant}' is not defined`
			);
		}
		return {
			value: flagDef.variations[variant] as FlagValue,
			variant,
			reason,
		};
	};

	if (!flagDef.enabled) {
		return serve(flagDef.default_variation, "DISABLED");
	}

	// Seeded per account+flag so the same targetingKey lands in different
	// buckets across flags, preventing correlated rollouts.
	let seed: number | undefined;

	const rules = [...flagDef.rules].sort((a, b) => {
		const aPriority = "priority" in a ? a.priority : 0;
		const bPriority = "priority" in b ? b.priority : 0;
		return aPriority - bPriority;
	});
	for (const rule of rules) {
		let ruleMatches = true;

		for (const condition of rule.conditions) {
			if (!evaluateCondition(condition, context)) {
				ruleMatches = false;
				break;
			}
		}

		if (
			ruleMatches &&
			rule.rollout !== undefined &&
			rule.rollout.percentage < 100
		) {
			seed ??= murmurhash3(`${accountId}:${flagDef.key}`, 0);
			const attr = context[rule.rollout.attribute || "targetingKey"];
			const bucket =
				attr !== null && attr !== undefined
					? murmurhash3(String(attr), seed)
					: (crypto.getRandomValues(randomBuf)[0] / 0x100000000) * 100;
			if (bucket >= rule.rollout.percentage) {
				ruleMatches = false;
			}
		}

		if (ruleMatches) {
			return serve(
				rule.serve_variation,
				rule.rollout !== undefined ? "SPLIT" : "TARGETING_MATCH"
			);
		}
	}

	return serve(flagDef.default_variation, "DEFAULT");
}

export type {
	BaseCondition,
	Condition,
	FlagValue,
	LogicalCondition,
	Operator,
	Rollout,
} from "./flags";

export function matchesType(value: FlagValue, expectedType: FlagType): boolean {
	switch (expectedType) {
		case "boolean":
			return typeof value === "boolean";
		case "string":
			return typeof value === "string";
		case "number":
			return typeof value === "number";
		case "object":
			return typeof value === "object" && value !== null;
		default:
			return false;
	}
}
