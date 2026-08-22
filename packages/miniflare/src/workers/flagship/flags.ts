import type {
	Condition,
	EvalFlag,
	FlagValue,
	Operator,
	Rollout,
} from "./evaluate";

export type FlagType = "boolean" | "string" | "number" | "json";

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

export function toEvalFlag(flag: Flag): EvalFlag {
	return {
		key: flag.key,
		enabled: flag.enabled,
		default_variation: flag.default_variation,
		variations: flag.variations,
		rules: [...flag.rules]
			.sort((a, b) => a.priority - b.priority)
			.map(({ conditions, serve_variation, rollout }) => ({
				conditions,
				serve_variation,
				rollout,
			})),
	};
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
}

export function validateFlagInput(input: FlagInput): void {
	if (!FLAG_KEY_REGEX.test(input.key)) {
		throw new Error(
			`Flag key '${input.key}' must be 1-64 alphanumeric, hyphen or underscore characters`
		);
	}

	const variationNames = Object.keys(input.variations);
	if (variationNames.length === 0) {
		throw new Error(`Flag '${input.key}' must define at least one variation`);
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
		throw new Error(
			`Flag '${input.key}' variations must all share the same type`
		);
	}
	if (Object.values(input.variations).some((value) => value === null)) {
		throw new Error(`Flag '${input.key}' variations cannot be null`);
	}

	if (!variationNames.includes(input.default_variation)) {
		throw new Error(
			`Flag '${input.key}' default variation '${input.default_variation}' is not defined`
		);
	}

	if (!Array.isArray(input.rules)) {
		throw new Error(`Flag '${input.key}' rules must be a list`);
	}

	const priorities = new Set<number>();
	for (const rule of input.rules) {
		if (!Array.isArray(rule.conditions)) {
			throw new Error(`Flag '${input.key}' rule conditions must be a list`);
		}
		for (const condition of rule.conditions) {
			validateCondition(input.key, condition, MAX_CONDITION_DEPTH);
		}
		if (!variationNames.includes(rule.serve_variation)) {
			throw new Error(
				`Flag '${input.key}' rule serves undefined variation '${rule.serve_variation}'`
			);
		}
		if (!Number.isInteger(rule.priority) || rule.priority < 1) {
			throw new Error(
				`Flag '${input.key}' rule priorities must be integers greater than or equal to 1`
			);
		}
		if (priorities.has(rule.priority)) {
			throw new Error(
				`Flag '${input.key}' has duplicate rule priority ${rule.priority}`
			);
		}
		priorities.add(rule.priority);

		if (rule.rollout !== undefined) {
			const { percentage, attribute } = rule.rollout;
			if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
				throw new Error(
					`Flag '${input.key}' rollout percentage must be a number between 0 and 100`
				);
			}
			if (attribute !== undefined && typeof attribute !== "string") {
				throw new Error(
					`Flag '${input.key}' rollout attribute must be a string`
				);
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
				`Flag '${input.key}' has targeting rules after a rule with no conditions`
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
		// The evaluator walks this array in order, so `priority` must decide it.
		rules: [...input.rules].sort((a, b) => a.priority - b.priority),
		type: getFlagType(input.variations),
		updated_at: new Date().toISOString(),
	};
}

export type { Condition, FlagValue, Rollout };
