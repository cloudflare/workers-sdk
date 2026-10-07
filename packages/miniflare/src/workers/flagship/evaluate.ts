import type { Condition, FlagInput, FlagValue, Rule } from "./flags";

// Vendored from Flagship data-plane commit 3135610e4d329b35398316a9038b3af440cf8e3a.
// Hashing and matching must remain byte-compatible with production.

export type EvaluationReason =
	| "STATIC"
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
const MAX_PATH_DEPTH = 5;

const encoder = new TextEncoder();
const randomBuf = new Uint32Array(1);
const MAX_RETAINED_HASH_BYTES = 32 * 1024;
const HASH_QUOTIENT_RANGE = Math.ceil(2 ** 32 / 100);
let hashBuf = new Uint8Array(512);

function isPrimitive(value: unknown): boolean {
	return (
		value === null || (typeof value !== "object" && typeof value !== "function")
	);
}

function isScalar(value: unknown): value is string | number | boolean {
	return (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
}

function getContextValue(
	context: EvaluationContext,
	attribute: string
): unknown {
	if (Object.hasOwn(context, attribute)) {
		return context[attribute];
	}
	if (!attribute.includes(".")) {
		return undefined;
	}
	const path = attribute.split(".");
	if (path.length > MAX_PATH_DEPTH) {
		return undefined;
	}
	let value: unknown = context;
	for (const segment of path) {
		if (isPrimitive(value) || !Object.hasOwn(value as object, segment)) {
			return undefined;
		}
		value = (value as Record<string, unknown>)[segment];
	}
	return value;
}

function murmurhash3(str: string, seed: number): number {
	const requiredBytes = str.length * 3;
	let b: Uint8Array;
	let n: number;
	if (requiredBytes > MAX_RETAINED_HASH_BYTES) {
		b = encoder.encode(str);
		n = b.byteLength;
	} else {
		if (hashBuf.byteLength < requiredBytes) {
			hashBuf = new Uint8Array(requiredBytes);
		}
		b = hashBuf;
		n = encoder.encodeInto(str, b).written;
	}
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
	return h >>> 0;
}

type StringOperator =
	| "equals"
	| "not_equals"
	| "contains"
	| "starts_with"
	| "ends_with";
type OrderingOperator =
	| "greater_than"
	| "less_than"
	| "greater_than_or_equals"
	| "less_than_or_equals";

function evaluateStringOperator(
	operator: StringOperator,
	attrValue: unknown,
	target: unknown
): boolean {
	if (attrValue === null) {
		return operator === "not_equals";
	}
	if (!isScalar(attrValue) || !isPrimitive(target)) {
		return false;
	}
	const actual = String(attrValue);
	const expected = String(target);
	switch (operator) {
		case "equals":
			return actual === expected;
		case "not_equals":
			return actual !== expected;
		case "contains":
			return actual.includes(expected);
		case "starts_with":
			return actual.startsWith(expected);
		case "ends_with":
			return actual.endsWith(expected);
	}
}

function toNumber(value: string | number | boolean): number {
	return typeof value === "string" && value.trim() === "" ? NaN : Number(value);
}

function compareValues(
	attrValue: unknown,
	target: unknown
): number | undefined {
	if (!isScalar(attrValue) || !isScalar(target)) {
		return undefined;
	}
	let actual: number;
	let expected: number;
	if (
		typeof target === "string" &&
		ISO_8601_REGEX.test(target) &&
		typeof attrValue === "string"
	) {
		actual = Date.parse(attrValue);
		if (Number.isNaN(actual)) {
			actual = toNumber(attrValue);
			expected = toNumber(target);
		} else {
			expected = Date.parse(target);
		}
	} else {
		actual = toNumber(attrValue);
		expected = toNumber(target);
	}
	if (Number.isNaN(actual) || Number.isNaN(expected)) {
		return undefined;
	}
	if (actual === expected) {
		return 0;
	}
	return actual < expected ? -1 : 1;
}

function evaluateOrderingOperator(
	operator: OrderingOperator,
	attrValue: unknown,
	target: unknown
): boolean {
	const comparison = compareValues(attrValue, target);
	if (comparison === undefined) {
		return false;
	}
	switch (operator) {
		case "greater_than":
			return comparison > 0;
		case "less_than":
			return comparison < 0;
		case "greater_than_or_equals":
			return comparison >= 0;
		case "less_than_or_equals":
			return comparison <= 0;
	}
}

function containsValue(values: unknown[], target: unknown): boolean {
	const expected = String(target);
	return values.some((value) => value !== null && String(value) === expected);
}

function containsPrimitiveValue(values: unknown[], target: unknown): boolean {
	const expected = String(target);
	return values.some((value) => isScalar(value) && String(value) === expected);
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
	const attrValue = getContextValue(context, attribute);
	if (attrValue === undefined) {
		return false;
	}

	switch (operator) {
		case "equals":
		case "not_equals":
		case "contains":
		case "starts_with":
		case "ends_with":
			return evaluateStringOperator(operator, attrValue, target);
		case "greater_than":
		case "less_than":
		case "greater_than_or_equals":
		case "less_than_or_equals":
			return evaluateOrderingOperator(operator, attrValue, target);
		case "in":
		case "not_in":
			if (!Array.isArray(target)) {
				return false;
			}
			if (attrValue === null) {
				return operator === "not_in";
			}
			if (!isScalar(attrValue)) {
				return false;
			}
			return operator === "in"
				? containsValue(target, attrValue)
				: !containsValue(target, attrValue);
		case "has":
		case "not_has":
			if (!Array.isArray(attrValue) || !isPrimitive(target)) {
				return false;
			}
			return operator === "has"
				? containsPrimitiveValue(attrValue, target)
				: !containsPrimitiveValue(attrValue, target);
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
	if (flagDef.rules.length === 0) {
		return serve(flagDef.default_variation, "STATIC");
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

		const { rollout } = rule;
		const isSplit = rollout !== undefined && rollout.percentage < 100;
		if (ruleMatches && rollout !== undefined) {
			const attr = getContextValue(
				context,
				rollout.attribute || "targetingKey"
			);
			if (attr !== null && attr !== undefined && !isScalar(attr)) {
				ruleMatches = false;
			} else if (isSplit) {
				// Keep the original 100-bucket seed so existing assignments stay stable.
				seed ??= murmurhash3(`${accountId}:${flagDef.key}`, 0) % 100;
				let bucket: number;
				if (isScalar(attr)) {
					const hash = murmurhash3(String(attr), seed);
					bucket = (hash % 100) + Math.floor(hash / 100) / HASH_QUOTIENT_RANGE;
				} else {
					bucket = (crypto.getRandomValues(randomBuf)[0] / 0x100000000) * 100;
				}
				if (bucket >= rollout.percentage) {
					ruleMatches = false;
				}
			}
		}

		if (ruleMatches) {
			return serve(rule.serve_variation, isSplit ? "SPLIT" : "TARGETING_MATCH");
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
