import type {
	FlagshipBaseCondition,
	FlagshipCondition,
	FlagshipRule,
} from "../../api";

export type FlagType = "boolean" | "string" | "number" | "json";

export type FlagshipOperator = FlagshipBaseCondition["operator"];

export const FLAGSHIP_OPERATOR_LABELS: Record<FlagshipOperator, string> = {
	contains: "Contains",
	ends_with: "Ends with",
	equals: "Equals",
	greater_than: "Greater than",
	greater_than_or_equals: "Greater than or equal",
	has: "Has",
	in: "Is one of",
	less_than: "Less than",
	less_than_or_equals: "Less than or equal",
	not_equals: "Does not equal",
	not_has: "Does not have",
	not_in: "Is not one of",
	starts_with: "Starts with",
};

export interface RuleConditionDraft {
	attribute: string;
	id: string;
	joinOperator: "AND" | "OR";
	operator: FlagshipOperator;
	originalOperator?: FlagshipOperator;
	originalValue?: unknown;
	originalValueText?: string;
	value: string;
	valueEdited: boolean;
}

export interface RuleDraft {
	conditions: RuleConditionDraft[];
	conditionsEditable: boolean;
	id: string;
	originalConditions?: FlagshipCondition[];
	originalDraftConditions?: RuleConditionDraft[];
	priority: number;
	rollout: {
		attribute: string;
		attributeEdited: boolean;
		originalAttribute?: string;
		percentage: string;
	} | null;
	serveVariationId: string;
}

export type DefaultServeMode = "percentage" | "variation";

export interface SplitDraft {
	variationId: string;
	weight: string;
}

export interface DefaultServeDraft {
	mode: DefaultServeMode;
	splits: SplitDraft[];
	targetingKey: string;
}

function isLogicalCondition(
	condition: FlagshipCondition
): condition is Extract<FlagshipCondition, { logical_operator: "AND" | "OR" }> {
	return "logical_operator" in condition;
}

function conditionValueToString(value: unknown): string {
	if (Array.isArray(value)) {
		return value.map(String).join("\n");
	}
	if (typeof value === "object" && value !== null) {
		return JSON.stringify(value);
	}
	return String(value ?? "");
}

function draftCondition(
	condition: FlagshipBaseCondition,
	joinOperator: "AND" | "OR"
): RuleConditionDraft {
	return {
		attribute: condition.attribute,
		id: crypto.randomUUID(),
		joinOperator,
		operator: condition.operator,
		originalOperator: condition.operator,
		originalValue: condition.value,
		originalValueText: conditionValueToString(condition.value),
		value: conditionValueToString(condition.value),
		valueEdited: false,
	};
}

export function flattenRuleConditions(
	conditions: FlagshipCondition[]
): RuleConditionDraft[] | null {
	const drafts: RuleConditionDraft[] = [];

	function appendAndClause(condition: FlagshipCondition): boolean {
		if (!isLogicalCondition(condition)) {
			drafts.push(draftCondition(condition, "AND"));
			return true;
		}
		if (condition.logical_operator === "OR") {
			if (condition.clauses.some(isLogicalCondition)) {
				return false;
			}
			condition.clauses.forEach((clause, index) => {
				if (!isLogicalCondition(clause)) {
					drafts.push(draftCondition(clause, index === 0 ? "AND" : "OR"));
				}
			});
			return true;
		}
		return condition.clauses.every(appendAndClause);
	}

	return conditions.every(appendAndClause) ? drafts : null;
}

export function ruleDraftsFrom(
	rules: FlagshipRule[],
	variationIdByName: Map<string, string>
): RuleDraft[] {
	return [...rules]
		.sort((a, b) => a.priority - b.priority)
		.map((rule) => {
			const editableConditions = flattenRuleConditions(rule.conditions);
			const conditions = editableConditions ?? [];
			return {
				conditions,
				conditionsEditable: editableConditions !== null,
				id: crypto.randomUUID(),
				originalConditions: rule.conditions,
				originalDraftConditions: structuredClone(conditions),
				priority: rule.priority,
				rollout:
					rule.rollout === undefined
						? null
						: {
								attribute: rule.rollout.attribute ?? "",
								attributeEdited: false,
								originalAttribute: rule.rollout.attribute,
								percentage: String(rule.rollout.percentage),
							},
				serveVariationId: variationIdByName.get(rule.serve_variation) ?? "",
			};
		});
}

function baseCondition(condition: RuleConditionDraft): FlagshipBaseCondition {
	const rawValue = condition.value.trim();
	const unchanged =
		condition.originalOperator === condition.operator &&
		condition.originalValueText === condition.value;
	let value: unknown = rawValue;
	if (unchanged) {
		value = condition.originalValue;
	} else if (condition.operator === "in" || condition.operator === "not_in") {
		value = rawValue
			.split("\n")
			.map((entry) => entry.trim())
			.filter(Boolean);
	} else if (
		condition.operator === "greater_than" ||
		condition.operator === "greater_than_or_equals" ||
		condition.operator === "less_than" ||
		condition.operator === "less_than_or_equals"
	) {
		value = Number.isFinite(Number(rawValue)) ? Number(rawValue) : rawValue;
	} else if (typeof condition.originalValue === "boolean") {
		value =
			rawValue === "true" ? true : rawValue === "false" ? false : rawValue;
	} else if (
		typeof condition.originalValue === "object" &&
		condition.originalValue !== null
	) {
		try {
			value = JSON.parse(rawValue) as unknown;
		} catch {
			value = rawValue;
		}
	}
	return {
		attribute: condition.attribute.trim(),
		operator: condition.operator,
		value,
	};
}

export function buildRuleConditions(
	conditions: RuleConditionDraft[]
): FlagshipCondition[] {
	const [onlyCondition] = conditions;
	if (onlyCondition === undefined) {
		return [];
	}
	if (conditions.length === 1) {
		return [baseCondition(onlyCondition)];
	}

	const groups: FlagshipBaseCondition[][] = [];
	for (const condition of conditions) {
		if (groups.length === 0 || condition.joinOperator === "AND") {
			groups.push([]);
		}
		const group = groups.at(-1);
		if (group !== undefined) {
			group.push(baseCondition(condition));
		}
	}
	const clauses: FlagshipCondition[] = groups.flatMap((group) => {
		const [condition] = group;
		if (condition === undefined) {
			return [];
		}
		return [
			group.length === 1
				? condition
				: { clauses: group, logical_operator: "OR" as const },
		];
	});
	return clauses.length === 1
		? clauses
		: [{ clauses, logical_operator: "AND" }];
}

/**
 * Remove a condition, promoting its successor to `AND` when the removed
 * condition started a group, so that the remaining groups keep their meaning.
 */
export function removeCondition(
	conditions: RuleConditionDraft[],
	index: number
): RuleConditionDraft[] {
	const next = conditions.filter((_, current) => current !== index);
	const successor = next[index];
	if (conditions[index]?.joinOperator === "AND" && successor !== undefined) {
		next[index] = { ...successor, joinOperator: "AND" };
	}
	return next;
}

function comparableConditions(conditions: RuleConditionDraft[]): unknown {
	return conditions.map(
		({
			id: _id,
			originalOperator: _operator,
			originalValue: _value,
			originalValueText: _text,
			valueEdited: _edited,
			...condition
		}) => condition
	);
}

export function canonicalRules(rules: FlagshipRule[] = []): string {
	return JSON.stringify(
		[...rules]
			.sort((a, b) => a.priority - b.priority)
			.map((rule, index) => ({
				conditions: rule.conditions ?? [],
				priority: index + 1,
				rollout:
					rule.rollout === undefined
						? null
						: {
								attribute: rule.rollout.attribute ?? null,
								percentage: rule.rollout.percentage,
							},
				serve_variation: rule.serve_variation,
			}))
	);
}

export function ruleDraftsToRules(
	drafts: RuleDraft[],
	variationNameById: Map<string, string>
): FlagshipRule[] {
	return drafts.map((draft) => {
		const unchanged =
			draft.conditionsEditable &&
			draft.originalConditions !== undefined &&
			draft.originalDraftConditions !== undefined &&
			JSON.stringify(comparableConditions(draft.conditions)) ===
				JSON.stringify(comparableConditions(draft.originalDraftConditions));
		const attribute =
			draft.rollout === null
				? undefined
				: draft.rollout.attributeEdited
					? draft.rollout.attribute.trim() || undefined
					: draft.rollout.originalAttribute;
		const conditions =
			(!draft.conditionsEditable || unchanged) &&
			draft.originalConditions !== undefined
				? draft.originalConditions
				: buildRuleConditions(draft.conditions);
		return {
			conditions,
			priority: draft.priority,
			rollout:
				draft.rollout === null
					? undefined
					: {
							...(attribute ? { attribute } : {}),
							percentage: Number(draft.rollout.percentage),
						},
			serve_variation:
				variationNameById.get(draft.serveVariationId)?.trim() ?? "",
		};
	});
}

export function validateRuleDrafts(
	drafts: RuleDraft[],
	variationIds: Set<string>,
	hasPercentageSplit = false
): string | null {
	for (const [ruleIndex, rule] of drafts.entries()) {
		if (!variationIds.has(rule.serveVariationId)) {
			return `Rule ${ruleIndex + 1} must serve an existing variant.`;
		}
		if (rule.conditionsEditable) {
			for (const condition of rule.conditions) {
				if (condition.attribute.trim() === "") {
					return `Rule ${ruleIndex + 1} has a condition without an attribute.`;
				}
				if (
					condition.value.trim() === "" &&
					(condition.originalValueText !== "" || condition.valueEdited)
				) {
					return `Rule ${ruleIndex + 1} has a condition without a value.`;
				}
			}
		}
		// A rollout below 100% still lets requests through, so only a rule
		// without one really matches everything.
		const alwaysMatches =
			rule.conditionsEditable &&
			rule.conditions.length === 0 &&
			(rule.rollout === null || Number(rule.rollout.percentage) >= 100);
		if (alwaysMatches) {
			if (hasPercentageSplit) {
				return `Rule ${ruleIndex + 1} matches every request, so the percentage split below would never be reached.`;
			}
			if (ruleIndex !== drafts.length - 1) {
				return `Rule ${ruleIndex + 1} matches every request and must be last.`;
			}
		}
		if (rule.rollout !== null && !isValidPercentage(rule.rollout.percentage)) {
			return `Rule ${ruleIndex + 1} rollout must be between 0 and 100% with at most two decimal places.`;
		}
	}
	return null;
}

function isValidPercentage(raw: string): boolean {
	const percentage = Number(raw);
	return (
		raw.trim() !== "" &&
		Number.isFinite(percentage) &&
		percentage >= 0 &&
		percentage <= 100 &&
		Math.abs(percentage * 100 - Math.round(percentage * 100)) <= 1e-9
	);
}

/**
 * A lone rule that always matches stays an ordinary catch-all rule, so that the
 * editor keeps showing it verbatim rather than folding it into a split.
 */
function isSplitGroup(trailing: FlagshipRule[]): boolean {
	if (trailing.length >= 2) {
		return true;
	}
	const [only] = trailing;
	return only?.rollout !== undefined && only.rollout.percentage < 100;
}

/**
 * Return exactly one split per current variant, keeping saved order because it
 * decides which bucket range each variant occupies.
 */
export function alignSplits(
	splits: SplitDraft[],
	variations: VariationDraft[]
): SplitDraft[] {
	const known = new Set(variations.map((variation) => variation.id));
	const seen = new Set<string>();
	const ordered: SplitDraft[] = [];
	for (const split of splits) {
		if (seen.has(split.variationId) || !known.has(split.variationId)) {
			continue;
		}
		seen.add(split.variationId);
		ordered.push({ variationId: split.variationId, weight: split.weight });
	}
	for (const variation of variations) {
		if (!seen.has(variation.id)) {
			ordered.push({ variationId: variation.id, weight: "0" });
		}
	}
	return ordered;
}

export function evenSplits(variations: VariationDraft[]): SplitDraft[] {
	const base = Math.floor(100 / variations.length);
	const remainder = 100 - base * variations.length;
	return variations.map((variation, index) => ({
		variationId: variation.id,
		weight: String(base + (index < remainder ? 1 : 0)),
	}));
}

export function serveDefaultVariation(
	variations: VariationDraft[],
	defaultVariationId: string
): DefaultServeDraft {
	return {
		mode: "variation",
		splits: variations.map((variation) => ({
			variationId: variation.id,
			weight: variation.id === defaultVariationId ? "100" : "0",
		})),
		targetingKey: "",
	};
}

/**
 * Split a flag's rules into targeting rules and the percentage split encoded by
 * the trailing condition-less rules, converting cumulative rollout percentages
 * back into per-variant weights.
 */
export function inferDefaultServe(
	rules: FlagshipRule[],
	defaultVariationId: string,
	variations: VariationDraft[],
	variationIdByName: Map<string, string>
): { defaultServe: DefaultServeDraft; targetingRules: FlagshipRule[] } {
	const sorted = [...rules].sort((a, b) => a.priority - b.priority);
	let splitStart = sorted.length;
	while (splitStart > 0 && sorted[splitStart - 1]?.conditions.length === 0) {
		splitStart -= 1;
	}
	const trailing = sorted.slice(splitStart);
	const servesKnownVariants = trailing.every((rule) =>
		variationIdByName.has(rule.serve_variation)
	);
	// A single targeting key drives the whole split, so rules bucketed by
	// different attributes cannot be merged into one without changing them.
	const sharesTargetingKey =
		new Set(trailing.map((rule) => rule.rollout?.attribute ?? "")).size <= 1;
	const defaultVariationName = variations.find(
		(variation) => variation.id === defaultVariationId
	)?.name;
	const seenVariations = new Set<string>();
	let previousThreshold = 0;
	let lastVariation = "";
	const preservesRanges = trailing.every((rule, index) => {
		const threshold = rule.rollout?.percentage ?? 100;
		if (
			threshold < previousThreshold ||
			(rule.serve_variation !== lastVariation &&
				seenVariations.has(rule.serve_variation)) ||
			(rule.serve_variation === defaultVariationName &&
				index < trailing.length - 1)
		) {
			return false;
		}
		previousThreshold = threshold;
		lastVariation = rule.serve_variation;
		seenVariations.add(lastVariation);
		return true;
	});

	if (
		!isSplitGroup(trailing) ||
		!servesKnownVariants ||
		!sharesTargetingKey ||
		!preservesRanges
	) {
		return {
			defaultServe: serveDefaultVariation(variations, defaultVariationId),
			targetingRules: sorted,
		};
	}

	const weightById = new Map<string, number>();
	const order: string[] = [];
	let previous = 0;
	for (const rule of trailing) {
		const cumulative = rule.rollout?.percentage ?? 100;
		const weight = Math.max(0, cumulative - previous);
		previous = cumulative;
		const variationId = variationIdByName.get(rule.serve_variation) ?? "";
		if (!weightById.has(variationId)) {
			order.push(variationId);
		}
		weightById.set(variationId, (weightById.get(variationId) ?? 0) + weight);
	}
	// Whatever the split does not cover falls through to the default variant.
	const remainder = Math.max(0, 100 - previous);
	if (remainder > 0) {
		if (!weightById.has(defaultVariationId)) {
			order.push(defaultVariationId);
		}
		weightById.set(
			defaultVariationId,
			(weightById.get(defaultVariationId) ?? 0) + remainder
		);
	}

	const [firstSplitRule] = trailing;
	return {
		defaultServe: {
			mode: "percentage",
			splits: alignSplits(
				order.map((variationId) => ({
					variationId,
					weight: String(weightById.get(variationId) ?? 0),
				})),
				variations
			),
			targetingKey: firstSplitRule?.rollout?.attribute ?? "",
		},
		targetingRules: sorted.slice(0, splitStart),
	};
}

/**
 * Encode a percentage split as condition-less rules placed after the targeting
 * rules.
 *
 * Percentages accumulate so that the bucket, which depends only on the
 * targeting key and is therefore identical for every rule, selects exactly one
 * variant. The final rule uses 100% so it always matches, and is dropped when
 * it serves the default variant because falling through has the same result.
 */
export function defaultServeToRules(
	serve: DefaultServeDraft,
	startPriority: number,
	defaultVariationId: string,
	variationNameById: Map<string, string>
): FlagshipRule[] {
	if (serve.mode !== "percentage") {
		return [];
	}

	const active = serve.splits.flatMap((split) => {
		const name = variationNameById.get(split.variationId)?.trim();
		const weight = Number(split.weight);
		if (name === undefined || name === "" || !Number.isFinite(weight)) {
			return [];
		}
		return weight > 0 ? [{ name, variationId: split.variationId, weight }] : [];
	});
	if (active.length === 0) {
		return [];
	}

	const attribute = serve.targetingKey.trim();
	const rollout = (percentage: number): FlagshipRule["rollout"] => ({
		...(attribute === "" ? {} : { attribute }),
		percentage,
	});

	// A two-way split against the default becomes a single rule for the other
	// variant, so move the default last where it is dropped below.
	if (active.length === 2 && active[0]?.variationId === defaultVariationId) {
		active.reverse();
	}

	const rules: FlagshipRule[] = [];
	let cumulative = 0;
	active.forEach((split, index) => {
		cumulative += split.weight;
		const isLast = index === active.length - 1;
		rules.push({
			conditions: [],
			priority: startPriority + index,
			rollout: rollout(isLast ? 100 : cumulative),
			serve_variation: split.name,
		});
	});

	if (active.at(-1)?.variationId === defaultVariationId) {
		rules.pop();
	}
	return rules;
}

export function validateDefaultServe(serve: DefaultServeDraft): string | null {
	if (serve.mode !== "percentage") {
		return null;
	}
	let total = 0;
	for (const split of serve.splits) {
		if (!isValidPercentage(split.weight)) {
			return "Each percentage split must be between 0 and 100 with at most two decimal places.";
		}
		total += Number(split.weight);
	}
	return Math.abs(total - 100) < 1e-9
		? null
		: `Percentage split must total 100% (currently ${total}%).`;
}

export function sanitizeVariationName(raw: string): string {
	return raw.replaceAll(/\s+/g, "-").replaceAll(/[^a-zA-Z0-9_-]/g, "");
}

export const FLAG_TYPE_LABELS: Record<FlagType, string> = {
	boolean: "Boolean",
	number: "Number",
	string: "String",
	json: "JSON",
};

export interface VariationDraft {
	id: string;
	name: string;
	value: string;
}

const FLAG_KEY_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

const DEFAULT_VARIATIONS: Record<
	FlagType,
	[{ name: string; value: string }, { name: string; value: string }]
> = {
	boolean: [
		{ name: "on", value: "true" },
		{ name: "off", value: "false" },
	],
	number: [
		{ name: "small", value: "10" },
		{ name: "large", value: "100" },
	],
	string: [
		{ name: "blue", value: "hex-0000ff" },
		{ name: "red", value: "hex-ff0000" },
	],
	json: [
		{ name: "dark", value: '{"theme":"dark","fontSize":14}' },
		{ name: "light", value: '{"theme":"light","fontSize":16}' },
	],
};

export function defaultVariationsForType(
	type: FlagType
): [VariationDraft, VariationDraft] {
	const [first, second] = DEFAULT_VARIATIONS[type];
	return [
		{ id: crypto.randomUUID(), name: first.name, value: first.value },
		{ id: crypto.randomUUID(), name: second.name, value: second.value },
	];
}

export function inferFlagType(
	variations: Record<string, unknown> | undefined
): FlagType {
	const [first] = Object.values(variations ?? {});
	if (typeof first === "boolean") {
		return "boolean";
	}
	if (typeof first === "number") {
		return "number";
	}
	if (typeof first === "string") {
		return "string";
	}
	return "json";
}

export function serializeVariationValue(
	type: FlagType,
	value: unknown
): string {
	if (type === "boolean") {
		return value === true ? "true" : "false";
	}
	if (type === "string") {
		return typeof value === "string" ? value : String(value);
	}
	if (type === "number") {
		return typeof value === "number" ? String(value) : String(value ?? "");
	}
	return JSON.stringify(value) ?? "";
}

export function variationDraftsFrom(
	type: FlagType,
	variations: Record<string, unknown> | undefined
): [VariationDraft, ...VariationDraft[]] {
	function toDraft([name, value]: [string, unknown]): VariationDraft {
		return {
			id: crypto.randomUUID(),
			name,
			value: serializeVariationValue(type, value),
		};
	}

	const [first, ...rest] = Object.entries(variations ?? {});
	if (first === undefined) {
		return defaultVariationsForType(type);
	}
	return [toDraft(first), ...rest.map(toDraft)];
}

export function validateFlagKey(
	key: string,
	existingKeys: Set<string>
): string | null {
	const trimmed = key.trim();
	if (trimmed.length === 0) {
		return "Enter a flag key.";
	}
	if (!FLAG_KEY_PATTERN.test(trimmed)) {
		return trimmed.length > 64
			? "Flag key must be 64 characters or fewer."
			: "Use only letters, numbers, hyphens, and underscores.";
	}
	if (existingKeys.has(trimmed)) {
		return "A flag with this key already exists in this application.";
	}
	return null;
}

export function parseVariationValue(
	type: FlagType,
	raw: string
): { ok: true; value: unknown } | { ok: false; error: string } {
	if (type === "boolean") {
		if (raw === "true") {
			return { ok: true, value: true };
		}
		if (raw === "false") {
			return { ok: true, value: false };
		}
		return { ok: false, error: "Boolean values must be true or false." };
	}
	if (type === "number") {
		if (raw.trim() === "" || !Number.isFinite(Number(raw))) {
			return { ok: false, error: "Number values must be numeric." };
		}
		return { ok: true, value: Number(raw) };
	}
	if (type === "json") {
		try {
			const value = JSON.parse(raw) as unknown;
			if (typeof value !== "object" || value === null) {
				return { ok: false, error: "JSON values must be objects or arrays." };
			}
			return { ok: true, value };
		} catch {
			return { ok: false, error: "JSON values must be valid JSON." };
		}
	}
	return { ok: true, value: raw };
}

export type ContextValueType =
	| "boolean"
	| "json"
	| "null"
	| "number"
	| "string";

export function parseContextValue(raw: string): {
	type: ContextValueType;
	value: unknown;
} {
	const trimmed = raw.trim();
	if (trimmed === "") {
		return { type: "string", value: "" };
	}
	const parsable =
		trimmed === "null" ||
		trimmed === "true" ||
		trimmed === "false" ||
		/^-?\d/.test(trimmed) ||
		/^["[{]/.test(trimmed);
	if (!parsable) {
		return { type: "string", value: raw };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return { type: "string", value: raw };
	}
	if (parsed === null) {
		return { type: "null", value: null };
	}
	switch (typeof parsed) {
		case "boolean":
			return { type: "boolean", value: parsed };
		case "number":
			return { type: "number", value: parsed };
		case "string":
			return { type: "string", value: parsed };
		default:
			return { type: "json", value: parsed };
	}
}

export function flagshipErrorMessage(error: unknown, fallback: string): string {
	if (
		typeof error === "object" &&
		error !== null &&
		"errors" in error &&
		Array.isArray((error as { errors: unknown }).errors)
	) {
		const [first] = (error as { errors: Array<{ message?: string }> }).errors;
		if (first?.message) {
			return first.message;
		}
	}
	if (error instanceof Error) {
		return error.message;
	}
	return fallback;
}
