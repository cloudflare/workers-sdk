import { JsonFriendlyFatalError, UserError } from "@cloudflare/workers-utils";
import type { Condition, FlagType, Operator, Rule } from "./client";

const OPERATORS: Operator[] = [
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
];

function invalid(message: string, telemetryMessage: string): never {
	throw new UserError(message, { telemetryMessage });
}

export function jsonFriendlyError(
	message: string,
	telemetryMessage: string
): JsonFriendlyFatalError {
	return new JsonFriendlyFatalError(JSON.stringify({ error: message }), {
		telemetryMessage,
	});
}

export function coerceVariationValue(raw: string, type?: FlagType): unknown {
	switch (type) {
		case "boolean":
			if (raw === "true") {
				return true;
			}
			if (raw === "false") {
				return false;
			}
			return invalid(
				`Variation value "${raw}" is not a valid boolean (expected "true" or "false").`,
				"flagship variation invalid boolean"
			);
		case "number": {
			const n = Number(raw);
			if (raw.trim() === "" || !Number.isFinite(n)) {
				return invalid(
					`Variation value "${raw}" is not a valid finite number.`,
					"flagship variation invalid number"
				);
			}
			return n;
		}
		case "json":
			try {
				return JSON.parse(raw);
			} catch {
				return invalid(
					`Variation value "${raw}" is not valid JSON.`,
					"flagship variation invalid json"
				);
			}
		case "string":
			return raw;
		default:
			return inferScalar(raw);
	}
}

function inferScalar(raw: string): unknown {
	if (raw === "true") {
		return true;
	}
	if (raw === "false") {
		return false;
	}
	const trimmed = raw.trim();
	if (trimmed !== "") {
		const n = Number(trimmed);
		if (Number.isFinite(n) && String(n) === trimmed) {
			return n;
		}
	}
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return raw;
		}
	}
	return raw;
}

export function parseVariations(
	entries: string[],
	type?: FlagType
): Record<string, unknown> {
	const variations: Record<string, unknown> = {};
	for (const entry of entries) {
		const eq = entry.indexOf("=");
		if (eq === -1) {
			invalid(
				`Invalid --variation "${entry}". Expected format "name=value".`,
				"flagship variation invalid format"
			);
		}
		const name = entry.slice(0, eq).trim();
		const value = entry.slice(eq + 1);
		if (name === "") {
			invalid(
				`Invalid --variation "${entry}". Variation name is empty.`,
				"flagship variation empty name"
			);
		}
		if (name in variations) {
			invalid(
				`Duplicate variation "${name}". Each variation may only be set once.`,
				"flagship variation duplicate name"
			);
		}
		variations[name] = coerceVariationValue(value, type);
	}
	return variations;
}

export function buildCreateVariations(
	entries: string[] | undefined,
	type?: FlagType
): { variations: Record<string, unknown>; defaultVariation: string } {
	if (!entries || entries.length === 0) {
		if (type === undefined || type === "boolean") {
			return {
				variations: { on: true, off: false },
				defaultVariation: "off",
			};
		}
		invalid(
			`At least one --variation is required for ${type} flags.`,
			"flagship create missing variations"
		);
	}
	const variations = parseVariations(entries, type);
	return { variations, defaultVariation: Object.keys(variations)[0] };
}

export function parseContext(
	entries: string[] | undefined
): Record<string, string> {
	const context: Record<string, string> = {};
	for (const entry of entries ?? []) {
		const eq = entry.indexOf("=");
		if (eq === -1) {
			invalid(
				`Invalid --context "${entry}". Expected format "name=value".`,
				"flagship context invalid format"
			);
		}
		const name = entry.slice(0, eq).trim();
		if (name === "") {
			invalid(
				`Invalid --context "${entry}". Context name is empty.`,
				"flagship context empty name"
			);
		}
		context[name] = entry.slice(eq + 1);
	}
	return context;
}

export function parseWeights(
	entries: string[] | undefined
): Record<string, number> {
	if (!entries || entries.length === 0) {
		invalid(
			"At least one --weight is required.",
			"flagship split missing weights"
		);
	}
	const weights: Record<string, number> = {};
	for (const entry of entries) {
		const eq = entry.indexOf("=");
		if (eq === -1) {
			invalid(
				`Invalid --weight "${entry}". Expected format "variation=weight".`,
				"flagship split invalid weight format"
			);
		}
		const variation = entry.slice(0, eq).trim();
		const weight = Number(entry.slice(eq + 1).trim());
		if (variation === "" || !Number.isFinite(weight) || weight < 0) {
			invalid(
				`Invalid --weight "${entry}". Weight must be a non-negative finite number.`,
				"flagship split invalid weight"
			);
		}
		if (variation in weights) {
			invalid(
				`Duplicate weight for variation "${variation}". Each variation may only be weighted once.`,
				"flagship split duplicate weight"
			);
		}
		weights[variation] = weight;
	}
	if (Object.values(weights).every((weight) => weight === 0)) {
		invalid(
			"At least one --weight must be greater than 0.",
			"flagship split zero weights"
		);
	}
	return weights;
}

export type ParsedRule = Omit<Rule, "priority"> & { priority?: number };

export function parseRuleJson(specs: string[]): ParsedRule[] {
	return specs.map((spec) => {
		let parsed: unknown;
		try {
			parsed = JSON.parse(spec);
		} catch {
			return invalid(
				`Invalid --rule-json "${spec}". Expected a JSON object.`,
				"flagship rule-json invalid"
			);
		}
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return invalid(
				`Invalid --rule-json "${spec}". Expected a JSON object describing a single rule.`,
				"flagship rule-json invalid"
			);
		}
		assertParsedRule(parsed, spec);
		return parsed as ParsedRule;
	});
}

export function parseRules(specs: string[]): ParsedRule[] {
	return specs.map(parseRule);
}

export function finalizeRules(
	rules: ParsedRule[],
	options: { existing?: Rule[] } = {}
): Rule[] {
	const used = new Set<number>();
	for (const rule of options.existing ?? []) {
		used.add(rule.priority);
	}
	for (const rule of rules) {
		if (rule.priority !== undefined) {
			if (used.has(rule.priority)) {
				invalid(
					`Duplicate rule priority ${rule.priority}. Rule priorities must be unique within a flag.`,
					"flagship rule duplicate priority"
				);
			}
			used.add(rule.priority);
		}
	}
	let next = 1;
	return rules.map((rule) => {
		if (rule.priority !== undefined) {
			return { ...rule, priority: rule.priority };
		}
		while (used.has(next)) {
			next++;
		}
		used.add(next);
		return { ...rule, priority: next };
	});
}

function variationTypeLabel(value: unknown): string {
	if (typeof value === "boolean") {
		return "boolean";
	}
	if (typeof value === "number") {
		return "number";
	}
	if (typeof value === "string") {
		return "string";
	}
	return "json";
}

export function assertConsistentVariationTypes(
	variations: Record<string, unknown>
): void {
	const entries = Object.entries(variations);
	if (entries.length === 0) {
		return;
	}
	const [firstName, firstValue] = entries[0];
	const expected = variationTypeLabel(firstValue);
	for (const [name, value] of entries.slice(1)) {
		const actual = variationTypeLabel(value);
		if (actual !== expected) {
			invalid(
				`Variation "${name}" is ${actual} but variation "${firstName}" is ${expected}. All variations on a flag must use the same value type.`,
				"flagship variation inconsistent type"
			);
		}
	}
}

export function assertVariationsExist(
	variations: Record<string, unknown>,
	defaultVariation: string,
	rules: Rule[]
): void {
	const names = Object.keys(variations);
	const known = new Set(names);
	const available = names.length > 0 ? names.join(", ") : "(none)";
	if (!known.has(defaultVariation)) {
		invalid(
			`Default variation "${defaultVariation}" is not one of the flag's variations: ${available}.`,
			"flagship default variation unknown"
		);
	}
	for (const rule of rules) {
		if (!known.has(rule.serve_variation)) {
			invalid(
				`Rule with priority ${rule.priority} serves unknown variation "${rule.serve_variation}". Available variations: ${available}.`,
				"flagship rule serves unknown variation"
			);
		}
	}
}

export function hasTargetingConditions(rules: Rule[]): boolean {
	return rules.some((rule) => rule.conditions.length > 0);
}

export async function confirmRuleReplacement(
	rules: Rule[],
	options: {
		json: boolean;
		force: boolean;
		action: string;
		confirm: (message: string) => Promise<boolean>;
	}
): Promise<boolean> {
	if (!hasTargetingConditions(rules)) {
		return true;
	}
	if (options.json && !options.force) {
		throw jsonFriendlyError(
			`This flag has existing targeting rule(s) with conditions that will be replaced by this ${options.action}. Pass --force to confirm.`,
			"flagship rule replacement requires force"
		);
	}
	if (options.force) {
		return true;
	}
	return await options.confirm(
		`This flag has existing targeting rule(s) with conditions. Continuing will replace them with this ${options.action}. Continue?`
	);
}

export function validateLimit(
	limit: number | undefined,
	telemetryMessage: string
): void {
	if (limit === undefined) {
		return;
	}
	if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
		invalid(
			`Invalid --limit "${limit}". Expected an integer between 1 and 200.`,
			telemetryMessage
		);
	}
}

function assertParsedRule(
	value: unknown,
	spec: string
): asserts value is ParsedRule {
	if (!isRecord(value)) {
		invalid(
			`Invalid --rule-json "${spec}". Expected a JSON object describing a single rule.`,
			"flagship rule-json invalid"
		);
	}
	assertNoUnknownKeys(
		value,
		["priority", "conditions", "serve_variation", "rollout"],
		spec
	);
	if (
		typeof value.serve_variation !== "string" ||
		value.serve_variation === ""
	) {
		invalid(
			`Invalid --rule-json "${spec}". Expected non-empty string "serve_variation".`,
			"flagship rule-json invalid serve"
		);
	}
	if (!Array.isArray(value.conditions)) {
		invalid(
			`Invalid --rule-json "${spec}". Expected "conditions" to be an array.`,
			"flagship rule-json invalid conditions"
		);
	}
	if (
		"priority" in value &&
		(!Number.isInteger(value.priority) || Number(value.priority) < 1)
	) {
		invalid(
			`Invalid --rule-json "${spec}". Expected "priority" to be an integer >= 1.`,
			"flagship rule-json invalid priority"
		);
	}
	for (const condition of value.conditions) {
		assertJsonCondition(condition, spec);
	}
	if ("rollout" in value && value.rollout !== undefined) {
		assertJsonRollout(value.rollout, spec);
	}
}

function assertJsonCondition(value: unknown, spec: string): void {
	if (!isRecord(value)) {
		invalid(
			`Invalid --rule-json "${spec}". Expected each condition to be an object.`,
			"flagship rule-json invalid condition"
		);
	}
	if ("logical_operator" in value || "clauses" in value) {
		assertNoUnknownKeys(value, ["logical_operator", "clauses"], spec);
		if (value.logical_operator !== "AND" && value.logical_operator !== "OR") {
			invalid(
				`Invalid --rule-json "${spec}". Expected logical_operator to be "AND" or "OR".`,
				"flagship rule-json invalid logical operator"
			);
		}
		if (!Array.isArray(value.clauses) || value.clauses.length === 0) {
			invalid(
				`Invalid --rule-json "${spec}". Expected logical condition "clauses" to be a non-empty array.`,
				"flagship rule-json invalid clauses"
			);
		}
		for (const clause of value.clauses) {
			assertJsonCondition(clause, spec);
		}
		return;
	}
	assertNoUnknownKeys(value, ["attribute", "operator", "value"], spec);
	if (typeof value.attribute !== "string" || value.attribute === "") {
		invalid(
			`Invalid --rule-json "${spec}". Expected condition "attribute" to be a non-empty string.`,
			"flagship rule-json invalid attribute"
		);
	}
	if (typeof value.operator !== "string" || !isOperator(value.operator)) {
		invalid(
			`Invalid --rule-json "${spec}". Expected condition "operator" to be one of: ${OPERATORS.join(", ")}.`,
			"flagship rule-json invalid operator"
		);
	}
	if (!("value" in value)) {
		invalid(
			`Invalid --rule-json "${spec}". Expected condition "value".`,
			"flagship rule-json missing value"
		);
	}
	if (
		(value.operator === "in" || value.operator === "not_in") &&
		!Array.isArray(value.value)
	) {
		invalid(
			`Invalid --rule-json "${spec}". Expected condition "value" to be an array for ${value.operator}.`,
			"flagship rule-json invalid array value"
		);
	}
}

function assertJsonRollout(value: unknown, spec: string): void {
	if (!isRecord(value)) {
		invalid(
			`Invalid --rule-json "${spec}". Expected "rollout" to be an object.`,
			"flagship rule-json invalid rollout"
		);
	}
	assertNoUnknownKeys(value, ["percentage", "attribute"], spec);
	if (
		typeof value.percentage !== "number" ||
		Number.isNaN(value.percentage) ||
		value.percentage < 0 ||
		value.percentage > 100
	) {
		invalid(
			`Invalid --rule-json "${spec}". Expected rollout "percentage" between 0 and 100.`,
			"flagship rule-json invalid rollout percentage"
		);
	}
	if (
		"attribute" in value &&
		value.attribute !== undefined &&
		typeof value.attribute !== "string"
	) {
		invalid(
			`Invalid --rule-json "${spec}". Expected rollout "attribute" to be a string.`,
			"flagship rule-json invalid rollout attribute"
		);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNoUnknownKeys(
	value: Record<string, unknown>,
	allowed: string[],
	spec: string
): void {
	const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unknown.length > 0) {
		invalid(
			`Invalid --rule-json "${spec}". Unexpected ${unknown.length === 1 ? "field" : "fields"} ${unknown
				.map((key) => `"${key}"`)
				.join(", ")}. Allowed: ${allowed.join(", ")}.`,
			"flagship rule-json unknown field"
		);
	}
}

function isOperator(value: string): value is Operator {
	return OPERATORS.includes(value as Operator);
}

// A string paired with a same-length "mask" in which characters inside quotes or
// [brackets] are blanked. Splitting on the mask (";", "AND"/"OR", operators, ",")
// therefore ignores reserved tokens inside values and lists. Slices keep both
// strings aligned, so the mask is only ever computed once per expression.
type Masked = { text: string; mask: string };

function mask(text: string): Masked {
	const chars = text.split("");
	let quote: string | null = null;
	let depth = 0;
	for (let i = 0; i < chars.length; i++) {
		const ch = chars[i];
		if (quote !== null) {
			if (ch === quote) {
				quote = null;
			} else {
				chars[i] = "_";
			}
		} else if (ch === '"' || ch === "'") {
			quote = ch;
		} else if (ch === "[") {
			depth++;
		} else if (ch === "]") {
			if (depth === 0) {
				invalid(
					`Unbalanced "]" in expression "${text}".`,
					"flagship dsl unbalanced bracket"
				);
			}
			depth--;
		} else if (depth > 0) {
			chars[i] = "_";
		}
	}
	if (quote !== null) {
		invalid(
			`Unterminated ${quote === '"' ? "double" : "single"} quote in expression "${text}".`,
			"flagship dsl unterminated quote"
		);
	}
	if (depth > 0) {
		invalid(
			`Unterminated "[" in expression "${text}".`,
			"flagship dsl unterminated bracket"
		);
	}
	return { text, mask: chars.join("") };
}

function sliceMasked(m: Masked, start: number, end?: number): Masked {
	return { text: m.text.slice(start, end), mask: m.mask.slice(start, end) };
}

function trimMasked(m: Masked): Masked {
	const start = m.text.length - m.text.trimStart().length;
	return sliceMasked(m, start, m.text.trimEnd().length);
}

function splitMasked(m: Masked, separator: string): Masked[] {
	const parts: Masked[] = [];
	let start = 0;
	let index = m.mask.indexOf(separator);
	while (index !== -1) {
		parts.push(sliceMasked(m, start, index));
		start = index + separator.length;
		index = m.mask.indexOf(separator, start);
	}
	parts.push(sliceMasked(m, start));
	return parts;
}

function unquote(value: string): string | undefined {
	const quote = value[0];
	if (
		value.length >= 2 &&
		(quote === '"' || quote === "'") &&
		value[value.length - 1] === quote
	) {
		return value.slice(1, -1);
	}
	return undefined;
}

function parseRule(spec: string): ParsedRule {
	const rule: ParsedRule = { conditions: [], serve_variation: "" };
	let hasServe = false;
	for (const segment of splitMasked(mask(spec), ";")) {
		const { text, mask: segMask } = trimMasked(segment);
		if (text === "") {
			continue;
		}
		const eq = segMask.indexOf("=");
		if (eq === -1) {
			invalid(
				`Invalid --rule segment "${text}". Expected "key=value".`,
				"flagship rule segment invalid"
			);
		}
		const key = text.slice(0, eq).trim();
		const value = text.slice(eq + 1).trim();
		switch (key) {
			case "priority": {
				const priority = Number(value);
				if (!Number.isInteger(priority) || priority < 1) {
					invalid(
						`Invalid rule priority "${value}". Expected an integer >= 1.`,
						"flagship rule invalid priority"
					);
				}
				rule.priority = priority;
				break;
			}
			case "serve":
				if (value === "") {
					invalid(
						`Invalid --rule segment "${text}". "serve" must name a variation.`,
						"flagship rule empty serve"
					);
				}
				rule.serve_variation = unquote(value) ?? value;
				hasServe = true;
				break;
			case "when":
				rule.conditions = parseConditions(value);
				break;
			case "rollout":
				rule.rollout = parseRollout(value);
				break;
			default:
				invalid(
					`Unknown --rule key "${key}". Expected one of: priority, serve, when, rollout.`,
					"flagship rule unknown key"
				);
		}
	}
	if (!hasServe) {
		invalid(
			`Missing "serve" in --rule "${spec}".`,
			"flagship rule missing serve"
		);
	}
	return rule;
}

export function parseConditions(expr: string): Condition[] {
	const root = trimMasked(mask(expr));
	if (root.text === "") {
		invalid(
			"Condition expression is empty.",
			"flagship condition empty expression"
		);
	}
	if (
		/^(?:AND|OR)\s/.test(root.mask) ||
		/\s(?:AND|OR)$/.test(root.mask) ||
		/\s(?:AND|OR)\s+(?:AND|OR)\s/.test(root.mask)
	) {
		invalid(
			`Invalid condition expression "${expr}". Logical operators must appear between conditions.`,
			"flagship condition invalid logical expression"
		);
	}
	const groups = splitKeyword(root, "OR").map((group) =>
		splitKeyword(group, "AND").map(parseCondition)
	);
	if (groups.length <= 1) {
		return groups[0] ?? [];
	}
	const clauses: Condition[] = groups.map((conditions) =>
		conditions.length === 1
			? conditions[0]
			: { logical_operator: "AND", clauses: conditions }
	);
	return [{ logical_operator: "OR", clauses }];
}

function splitKeyword(expr: Masked, keyword: "AND" | "OR"): Masked[] {
	const parts = splitMasked(expr, ` ${keyword} `).map(trimMasked);
	if (parts.some((part) => part.text === "")) {
		invalid(
			`Invalid condition expression "${expr.text}". Logical operators must appear between conditions.`,
			"flagship condition invalid logical expression"
		);
	}
	return parts;
}

function parseCondition(leaf: Masked): Condition {
	const match = OPERATORS.map((operator) => ({
		operator,
		index: leaf.mask.indexOf(` ${operator} `),
	}))
		.filter(({ index }) => index !== -1)
		.sort(
			(a, b) => a.index - b.index || b.operator.length - a.operator.length
		)[0];
	if (!match) {
		invalid(
			`Could not find a valid operator in condition "${leaf.text}". Expected one of: ${OPERATORS.join(", ")}.`,
			"flagship condition invalid operator"
		);
	}
	const attribute = leaf.text.slice(0, match.index).trim();
	if (attribute === "") {
		invalid(
			`Condition "${leaf.text}" is missing an attribute.`,
			"flagship condition missing attribute"
		);
	}
	const value = leaf.text.slice(match.index + match.operator.length + 2).trim();
	if (value === "") {
		invalid(
			`Condition "${leaf.text}" is missing a value.`,
			"flagship condition missing value"
		);
	}
	return {
		attribute,
		operator: match.operator,
		value: parseConditionValue(value, match.operator),
	};
}

function parseConditionValue(raw: string, operator: Operator): unknown {
	if (operator === "in" || operator === "not_in") {
		return parseList(raw, operator);
	}
	return unquote(raw) ?? inferScalar(raw);
}

function parseList(raw: string, operator: Operator): unknown[] {
	if (!raw.startsWith("[") || !raw.endsWith("]")) {
		invalid(
			`Invalid value "${raw}" for "${operator}". Expected a bracketed list, e.g. [US,CA] or ["US","CA"].`,
			"flagship condition invalid list"
		);
	}
	const inner = trimMasked(mask(raw.slice(1, -1)));
	if (inner.text === "") {
		return [];
	}
	return splitMasked(inner, ",").map((part) => {
		const item = trimMasked(part).text;
		if (item === "") {
			invalid(
				`Invalid list "${raw}" for "${operator}". List items must not be empty.`,
				"flagship condition empty list item"
			);
		}
		return unquote(item) ?? inferScalar(item);
	});
}

export function parseRollout(value: string): {
	percentage: number;
	attribute?: string;
} {
	const at = value.indexOf("@");
	const pctPart = at === -1 ? value : value.slice(0, at);
	const attribute = at === -1 ? undefined : value.slice(at + 1).trim();
	const pctText = pctPart.replace(/%$/, "").trim();
	const percentage = Number(pctText);
	if (
		pctText === "" ||
		!Number.isFinite(percentage) ||
		percentage < 0 ||
		percentage > 100
	) {
		invalid(
			`Invalid rollout "${value}". Expected a percentage between 0 and 100, optionally followed by "@attribute".`,
			"flagship rollout invalid"
		);
	}
	if (
		attribute !== undefined &&
		(attribute === "" || attribute.includes("@"))
	) {
		invalid(
			`Invalid rollout "${value}". Expected a single non-empty attribute after "@".`,
			"flagship rollout invalid attribute"
		);
	}
	return attribute !== undefined ? { percentage, attribute } : { percentage };
}
