export type FlagType = "boolean" | "string" | "number" | "json";

export const FLAG_TYPE_LABELS: Record<FlagType, string> = {
	boolean: "Boolean",
	json: "JSON",
	number: "Number",
	string: "String",
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

export function shellQuote(value: string): string {
	// Single quotes keep copied shell arguments inert; embedded quotes close and reopen safely.
	return `'${value.replaceAll("'", `'\\''`)}'`;
}
