import type { Condition, EvalFlag, FlagValue, Rollout } from "./evaluate";

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

const FLAG_KEY_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

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

	if (!variationNames.includes(input.default_variation)) {
		throw new Error(
			`Flag '${input.key}' default variation '${input.default_variation}' is not defined`
		);
	}

	const priorities = new Set<number>();
	for (const rule of input.rules) {
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
			const { percentage } = rule.rollout;
			if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
				throw new Error(
					`Flag '${input.key}' rollout percentage must be an integer between 0 and 100`
				);
			}
		}
	}

	let seenCatchAll = false;
	for (const rule of [...input.rules].sort((a, b) => a.priority - b.priority)) {
		if (rule.conditions.length === 0) {
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
