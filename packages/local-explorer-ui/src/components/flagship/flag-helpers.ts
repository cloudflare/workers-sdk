export type FlagType = "boolean" | "string" | "number" | "json";

export interface VariationDraft {
	id: string;
	name: string;
	value: string;
}

const FLAG_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-_]*$/;

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

/**
 * Render a variation value compactly for table cells.
 *
 * @param value The variation's value.
 * @returns A short display string.
 */
export function formatFlagValue(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	return JSON.stringify(value);
}

/**
 * Build the two default variations for a flag type, matching dash.
 *
 * @param type The variation value type.
 * @returns Draft rows ready for the create form.
 */
export function defaultVariationsForType(
	type: FlagType
): [VariationDraft, VariationDraft] {
	const [first, second] = DEFAULT_VARIATIONS[type];
	return [
		{ id: crypto.randomUUID(), name: first.name, value: first.value },
		{ id: crypto.randomUUID(), name: second.name, value: second.value },
	];
}

/**
 * Validate a flag key against the same rules as dash and the local store.
 *
 * @param key The candidate key.
 * @param existingKeys Keys already in the app, lowercased.
 * @returns An error message, or `null` if the key is valid.
 */
export function validateFlagKey(
	key: string,
	existingKeys: Set<string>
): string | null {
	const trimmed = key.trim();
	if (trimmed.length === 0) {
		return "Enter a flag key.";
	}
	if (trimmed.length > 64) {
		return "Flag key must be 64 characters or fewer.";
	}
	if (!FLAG_KEY_PATTERN.test(trimmed)) {
		return "Use only letters, numbers, hyphens, and underscores.";
	}
	if (existingKeys.has(trimmed.toLowerCase())) {
		return "A flag with this key already exists in this application.";
	}
	return null;
}

/**
 * Parse a typed variation value from the create form.
 *
 * @param type The variation value type.
 * @param raw The form string.
 * @returns The parsed value, or an error.
 */
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
		if (raw.trim() === "" || Number.isNaN(Number(raw))) {
			return { ok: false, error: "Number values must be numeric." };
		}
		return { ok: true, value: Number(raw) };
	}
	if (type === "json") {
		try {
			return { ok: true, value: JSON.parse(raw) as unknown };
		} catch {
			return { ok: false, error: "JSON values must be valid JSON." };
		}
	}
	return { ok: true, value: raw };
}

/**
 * Read the first error message out of a rejected API call.
 *
 * @param error The thrown value.
 * @param fallback Used when the envelope has no message.
 * @returns A user-facing error string.
 */
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
