import type { ParsedInputWorkerConfig } from "./schema";

/**
 * Thrown when `--env`/`CLOUDFLARE_ENV` names a mode the config does not declare.
 *
 * Callers are expected to catch this and re-throw it as whatever their own
 * user-facing error type is (`UserError` in Wrangler, for example) so the
 * message is presented consistently with the rest of their output.
 */
export class UnknownModeError extends Error {
	readonly mode: string;
	readonly availableModes: string[];

	constructor(mode: string, availableModes: string[]) {
		const available = availableModes.length
			? availableModes.map((name) => `"${name}"`).join(", ")
			: "none";
		super(
			`No mode named "${mode}" is defined in your config. Available modes: ${available}.`
		);
		this.name = "UnknownModeError";
		this.mode = mode;
		this.availableModes = availableModes;
	}
}

/**
 * Fields that are merged key by key rather than replaced wholesale.
 *
 * These are the two record-shaped fields on a Worker config. Merging them means
 * a mode can add a single binding without having to restate every binding the
 * base config already declared, which is the whole point of splitting a large
 * config up in the first place.
 */
const MERGED_RECORD_FIELDS = ["env", "exports"] as const;

/**
 * Collapse a config's `modes` down to a single flat Worker config.
 *
 * The base config supplies the defaults and the selected mode's overrides are
 * layered on top:
 *
 * - `env` and `exports` merge per key, so a mode adding `API_KEY` keeps every
 *   binding the base declared. A key present in both takes the mode's value.
 * - Every other field replaces the base value outright. Arrays in particular
 *   are not concatenated: a mode that sets `compatibilityFlags` owns that list
 *   completely, which avoids the surprise of inheriting a flag you cannot drop.
 *
 * `modes` is always stripped from the result, so nothing downstream of config
 * loading needs to know the feature exists.
 *
 * Passing `undefined` for `mode` selects the base config, which is what happens
 * when no `--env` flag and no `CLOUDFLARE_ENV` variable are set.
 *
 * A config that declares no `modes` is returned untouched whatever the mode is.
 * The function form of a config receives `ctx.mode` and may branch on it
 * directly, so a mode with nothing to select here is not an error.
 *
 * @throws {UnknownModeError} If the config declares `modes` but not this one.
 */
export function applyMode(
	config: ParsedInputWorkerConfig,
	mode: string | undefined
): ParsedInputWorkerConfig {
	const { modes, ...base } = config;

	if (mode === undefined || modes === undefined) {
		return base;
	}

	const override = modes[mode];
	if (override === undefined) {
		throw new UnknownModeError(mode, Object.keys(modes));
	}

	const merged: Record<string, unknown> = { ...base };

	for (const [field, value] of Object.entries(override)) {
		if (value === undefined) {
			continue;
		}
		merged[field] = value;
	}

	for (const field of MERGED_RECORD_FIELDS) {
		const baseValue = base[field];
		const overrideValue = override[field];
		if (baseValue === undefined || overrideValue === undefined) {
			continue;
		}
		merged[field] = { ...baseValue, ...overrideValue };
	}

	return merged as ParsedInputWorkerConfig;
}
