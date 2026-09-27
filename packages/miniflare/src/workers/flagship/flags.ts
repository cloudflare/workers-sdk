export type FlagType = "boolean" | "string" | "number" | "json";

export type FlagValue =
	| boolean
	| string
	| number
	| Record<string, unknown>
	| unknown[];

export type Operator =
	| "equals"
	| "not_equals"
	| "greater_than"
	| "less_than"
	| "greater_than_or_equals"
	| "less_than_or_equals"
	| "contains"
	| "starts_with"
	| "ends_with"
	| "in"
	| "not_in";

export interface BaseCondition {
	attribute: string;
	operator: Operator;
	value: unknown;
}

export interface LogicalCondition {
	logical_operator: "AND" | "OR";
	clauses: Condition[];
}

export type Condition = BaseCondition | LogicalCondition;

export interface Rollout {
	percentage: number;
	attribute?: string;
}

export interface Rule {
	priority: number;
	conditions: Condition[];
	serve_variation: string;
	rollout?: Rollout;
}

export interface FlagInput {
	key: string;
	description?: string | null;
	enabled: boolean;
	default_variation: string;
	variations: Record<string, unknown>;
	rules: Rule[];
}

export interface Flag extends FlagInput {
	type: FlagType;
	updated_at: string;
}

export interface FlagChanges {
	description?: string | null;
	enabled?: boolean;
	default_variation?: string;
	variations?: Record<string, unknown>;
	rules?: Rule[];
}

const FLAG_KEY_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export function flagNotFoundMessage(flagKey: string): string {
	return `Flag '${flagKey}' not found`;
}

const OPERATORS = new Set<Operator>([
	"equals",
	"not_equals",
	"greater_than",
	"less_than",
	"greater_than_or_equals",
	"less_than_or_equals",
	"contains",
	"starts_with",
	"ends_with",
	"in",
	"not_in",
]);

const LIST_OPERATORS = new Set<Operator>(["in", "not_in"]);

const MAX_CONDITION_DEPTH = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
	if (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "string"
	) {
		return true;
	}
	if (typeof value === "number") {
		return Number.isFinite(value);
	}
	if (typeof value !== "object" || seen.has(value)) {
		return false;
	}
	if (
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) !== Object.prototype &&
		Object.getPrototypeOf(value) !== null
	) {
		return false;
	}

	seen.add(value);
	const values = Array.isArray(value) ? value : Object.values(value);
	const valid = values.every((entry) => isJsonValue(entry, seen));
	seen.delete(value);
	return valid;
}

export function getFlagType(variations: Record<string, unknown>): FlagType {
	const [first] = Object.values(variations);
	switch (typeof first) {
		case "boolean":
			return "boolean";
		case "string":
			return "string";
		case "number":
			return "number";
		default:
			return "json";
	}
}

function validateCondition(
	key: string,
	condition: unknown,
	depth: number
): void {
	if (
		typeof condition !== "object" ||
		condition === null ||
		Array.isArray(condition)
	) {
		throw new Error(`Flag '${key}' has a condition that is not an object`);
	}

	if ("logical_operator" in condition) {
		const { logical_operator: operator, clauses } = condition as {
			logical_operator: unknown;
			clauses?: unknown;
		};
		if (operator !== "AND" && operator !== "OR") {
			throw new Error(
				`Flag '${key}' has a condition with an unknown logical operator '${String(operator)}'`
			);
		}
		if (!Array.isArray(clauses)) {
			throw new Error(
				`Flag '${key}' has a '${operator}' condition without a list of clauses`
			);
		}
		if (depth === 0) {
			throw new Error(`Flag '${key}' has conditions nested too deeply`);
		}
		for (const clause of clauses) {
			validateCondition(key, clause, depth - 1);
		}
		return;
	}

	const { attribute, operator, value } = condition as {
		attribute?: unknown;
		operator?: unknown;
		value?: unknown;
	};
	if (typeof attribute !== "string" || attribute === "") {
		throw new Error(
			`Flag '${key}' has a condition without an attribute to match on`
		);
	}
	if (typeof operator !== "string" || !OPERATORS.has(operator as Operator)) {
		throw new Error(
			`Flag '${key}' has a condition with an unknown operator '${String(operator)}'`
		);
	}
	if (LIST_OPERATORS.has(operator as Operator) && !Array.isArray(value)) {
		throw new Error(
			`Flag '${key}' has a '${operator}' condition whose value is not a list`
		);
	}
	if (value === undefined) {
		throw new Error(`Flag '${key}' has a condition without a value`);
	}
	if (!isJsonValue(value)) {
		throw new Error(
			`Flag '${key}' has a condition with a value that cannot be stored as JSON`
		);
	}
}

export function validateFlagInput(input: unknown): asserts input is FlagInput {
	if (!isRecord(input)) {
		throw new Error("Flag input must be an object");
	}

	const { key } = input;
	if (typeof key !== "string") {
		throw new Error("Flag key must be a string");
	}
	if (!FLAG_KEY_REGEX.test(key)) {
		throw new Error(
			`Flag key '${key}' must be 1-64 alphanumeric, hyphen or underscore characters`
		);
	}
	if (
		input.description !== undefined &&
		input.description !== null &&
		typeof input.description !== "string"
	) {
		throw new Error(`Flag '${key}' description must be a string or null`);
	}
	if (typeof input.enabled !== "boolean") {
		throw new Error(`Flag '${key}' enabled must be a boolean`);
	}
	if (!isRecord(input.variations)) {
		throw new Error(`Flag '${key}' variations must be an object`);
	}
	if (typeof input.default_variation !== "string") {
		throw new Error(`Flag '${key}' default variation must be a string`);
	}
	if (!Array.isArray(input.rules)) {
		throw new Error(`Flag '${key}' rules must be a list`);
	}

	const variationNames = Object.keys(input.variations);
	if (variationNames.length === 0) {
		throw new Error(`Flag '${key}' must define at least one variation`);
	}

	const types = new Set(
		Object.values(input.variations).map((value) =>
			typeof value === "boolean" ||
			typeof value === "string" ||
			typeof value === "number"
				? typeof value
				: "object"
		)
	);
	if (types.size > 1) {
		throw new Error(`Flag '${key}' variations must all share the same type`);
	}
	if (Object.values(input.variations).some((value) => value === null)) {
		throw new Error(`Flag '${key}' variations cannot be null`);
	}
	if (Object.values(input.variations).some((value) => !isJsonValue(value))) {
		throw new Error(
			`Flag '${key}' variations must contain values that can be stored as JSON`
		);
	}

	if (!variationNames.includes(input.default_variation)) {
		throw new Error(
			`Flag '${key}' default variation '${input.default_variation}' is not defined`
		);
	}

	const priorities = new Set<number>();
	for (const rule of input.rules) {
		if (!isRecord(rule)) {
			throw new Error(`Flag '${key}' rules must contain objects`);
		}
		if (!Array.isArray(rule.conditions)) {
			throw new Error(`Flag '${key}' rule conditions must be a list`);
		}
		for (const condition of rule.conditions) {
			validateCondition(key, condition, MAX_CONDITION_DEPTH);
		}
		if (typeof rule.serve_variation !== "string") {
			throw new Error(`Flag '${key}' rule served variation must be a string`);
		}
		if (!variationNames.includes(rule.serve_variation)) {
			throw new Error(
				`Flag '${key}' rule serves undefined variation '${rule.serve_variation}'`
			);
		}
		if (
			typeof rule.priority !== "number" ||
			!Number.isInteger(rule.priority) ||
			rule.priority < 1
		) {
			throw new Error(
				`Flag '${key}' rule priorities must be integers greater than or equal to 1`
			);
		}
		if (priorities.has(rule.priority)) {
			throw new Error(
				`Flag '${key}' has duplicate rule priority ${rule.priority}`
			);
		}
		priorities.add(rule.priority);

		if (rule.rollout !== undefined) {
			if (!isRecord(rule.rollout)) {
				throw new Error(`Flag '${key}' rollout must be an object`);
			}
			const { percentage, attribute } = rule.rollout;
			if (
				typeof percentage !== "number" ||
				!Number.isFinite(percentage) ||
				percentage < 0 ||
				percentage > 100
			) {
				throw new Error(
					`Flag '${key}' rollout percentage must be a number between 0 and 100`
				);
			}
			if (attribute !== undefined && typeof attribute !== "string") {
				throw new Error(`Flag '${key}' rollout attribute must be a string`);
			}
		}
	}

	let seenCatchAll = false;
	for (const rule of [...input.rules].sort((a, b) => a.priority - b.priority)) {
		if (
			rule.conditions.length === 0 &&
			(rule.rollout === undefined || rule.rollout.percentage === 100)
		) {
			seenCatchAll = true;
		} else if (seenCatchAll) {
			throw new Error(
				`Flag '${key}' has targeting rules after a rule with no conditions`
			);
		}
	}
}

export function toStoredFlag(input: FlagInput): Flag {
	return {
		key: input.key,
		description: input.description ?? null,
		enabled: input.enabled,
		default_variation: input.default_variation,
		variations: input.variations,
		// Evaluation order is defined by priority, not input array order.
		rules: [...input.rules].sort((a, b) => a.priority - b.priority),
		type: getFlagType(input.variations),
		updated_at: new Date().toISOString(),
	};
}
