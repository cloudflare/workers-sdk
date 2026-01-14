/**
 * Compatibility flags resolution for workerd.
 *
 * This module replicates the logic from workerd's C++ implementation in
 * src/workerd/io/compatibility-date.c++ (compileCompatibilityFlags function).
 *
 * It computes which compatibility flags are enabled based on:
 * 1. The compatibility date (flags are enabled by default after their enable date)
 * 2. Explicit compatibility flags (can enable flags early or disable them)
 * 3. Implied flags (some flags automatically enable others after a certain date)
 *
 * The types are generated from compatibility-date.capnp using capnp-es.
 *
 * @see {@link file://./../../../scripts/build-capnp-compat.mjs} for documentation
 * @module
 */

import { FLAG_METADATA } from "./compatibility-flags-metadata";
import type { CompatibilityFlags } from "./compatibility-date";
import type { FlagMetadata } from "./compatibility-flags-metadata";

/**
 * Type representing all compatibility flag field names.
 * Derived from the capnp-es generated CompatibilityFlags class.
 */
type CompatibilityFlagName = {
	[K in keyof CompatibilityFlags]: CompatibilityFlags[K] extends boolean
		? K
		: never;
}[keyof CompatibilityFlags];

/**
 * Type for the result of getWorkerdFeatureFlags.
 * Maps all boolean flag fields from CompatibilityFlags to boolean values.
 */
export type FeatureFlagsMap = {
	[K in CompatibilityFlagName]: boolean;
};

/**
 * Parses a compatibility date string (YYYY-MM-DD) into a comparable integer.
 *
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Integer representation (e.g., "2024-01-15" -> 20240115)
 * @throws Error if the date format is invalid
 */
function parseCompatDate(dateStr: string): number {
	const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) {
		throw new Error(
			`Invalid compatibility date format: "${dateStr}". Expected YYYY-MM-DD format.`
		);
	}
	const [, year, month, day] = match;
	return (
		parseInt(year, 10) * 10000 + parseInt(month, 10) * 100 + parseInt(day, 10)
	);
}

/**
 * Creates a map from enable/disable flag names to their field metadata.
 * This allows quick lookup when processing explicit compatibility flags.
 */
function createFlagNameMap(): Map<string, FlagMetadata> {
	const map = new Map<string, FlagMetadata>();

	for (const flag of FLAG_METADATA) {
		if (flag.enableFlag) {
			map.set(flag.enableFlag, flag);
		}
		if (flag.disableFlag) {
			map.set(flag.disableFlag, flag);
		}
	}

	return map;
}

/**
 * Computes which workerd feature flags are enabled based on compatibility date
 * and explicit compatibility flags.
 *
 * This function replicates the behavior of workerd's compileCompatibilityFlags()
 * C++ function, implementing:
 * - Date-based flag enablement (flags enabled after their compatEnableDate)
 * - Explicit flag overrides (compatEnableFlag / compatDisableFlag)
 * - Implied flag cascading (impliedByAfterDate annotations)
 *
 * @param compatibilityDate - Compatibility date string (YYYY-MM-DD format)
 * @param compatibilityFlags - Array of explicit compatibility flag names
 * @returns Record mapping field names to boolean enabled state
 * @throws Error if date format is invalid or unknown flags are provided
 *
 * ## Flag Resolution Logic
 *
 * ### Phase 1: Basic Resolution
 *
 * For each flag:
 *
 * 1. Check if enabled by date: `compatibilityDate >= flag.enableDate`
 * 2. Check if explicitly enabled: `flag.enableFlag in compatibilityFlags`
 * 3. Check if explicitly disabled: `flag.disableFlag in compatibilityFlags` (overrides everything)
 *
 * ### Phase 2: Implied Flags (Cascading)
 *
 * Uses fixed-point iteration to resolve transitive implications:
 *
 * - If flag A is enabled AND `compatibilityDate >= implication.date`, enable flag B
 * - Continues until no more flags are enabled
 * - Example: `nodejs_compat` (enabled) + date >= "2024-09-23" → enables `nodejs_compat_v2`
 *
 * ## Comparison with Workerd
 *
 * ### Similarities
 *
 * - Same resolution algorithm
 * - Same flag definitions from compatibility-date.capnp
 * - Implied flag cascading with fixed-point iteration
 * - Returns all flags with boolean values
 *
 * ### Differences
 *
 * - TypeScript vs C++ (easier to maintain and extend)
 * - No validation modes (always allows any date)
 * - No experimental flag filtering (always allows experimental flags)
 * - Throws errors instead of using error reporters
 * - Uses `capnp-es` for type generation + text parsing for annotations
 *
 * @example
 * ```typescript
 * const flags = getWorkerdFeatureFlags("2024-09-23", ["nodejs_compat"]);
 * // Returns: {
 * //   nodeJsCompat: true,
 * //   nodeJsCompatV2: true,  // implied by nodejs_compat after 2024-09-23
 * //   formDataParserSupportsFiles: true,  // enabled by date
 * //   ...
 * // }
 * ```
 */
export function getWorkerdFeatureFlags(
	compatibilityDate: string,
	compatibilityFlags: string[]
): FeatureFlagsMap {
	// Parse the compatibility date
	const parsedDate = parseCompatDate(compatibilityDate);

	// Create a set for quick lookup of explicit flags
	const flagSet = new Set(compatibilityFlags);

	// Create a map for quick lookup by flag name
	const flagNameMap = createFlagNameMap();

	// Validate that all provided flags are recognized
	for (const flagName of compatibilityFlags) {
		if (!flagNameMap.has(flagName)) {
			throw new Error(
				`Unknown compatibility flag: "${flagName}". This flag is not defined in the compatibility schema.`
			);
		}
	}

	// Initialize result object with all flags set to false
	const result: Record<string, boolean> = {};
	for (const flag of FLAG_METADATA) {
		result[flag.fieldName] = false;
	}

	// Phase 1: Resolve all flags based on date and explicit flags
	for (const flag of FLAG_METADATA) {
		let enabled = false;

		// Check if enabled by date
		if (flag.enableDate) {
			const flagDate = parseCompatDate(flag.enableDate);
			enabled = parsedDate >= flagDate;
		}

		// Check explicit enable flag (overrides date-based default)
		if (flag.enableFlag && flagSet.has(flag.enableFlag)) {
			enabled = true;
		}

		// Check explicit disable flag (overrides everything)
		if (flag.disableFlag && flagSet.has(flag.disableFlag)) {
			enabled = false;
		}

		result[flag.fieldName] = enabled;
	}

	// Phase 2: Process implied flags (cascading)
	// Continue iterating until no more changes occur (fixed-point iteration)
	let changed = true;
	let iterations = 0;
	const MAX_ITERATIONS = 100; // Safety limit to prevent infinite loops

	while (changed && iterations < MAX_ITERATIONS) {
		changed = false;
		iterations++;

		for (const flag of FLAG_METADATA) {
			// Skip if already enabled
			if (result[flag.fieldName]) {
				continue;
			}

			// Check if this flag should be implied by others
			if (flag.impliedBy) {
				for (const implication of flag.impliedBy) {
					// Check if all implying flags are enabled
					// Note: implication.names contains field names (camelCase), not enable flag names
					const allEnabled = implication.names.every((implierFieldName) => {
						// The field name is directly used in the result object
						return result[implierFieldName] === true;
					});

					// Check if the date requirement is met
					const implDate = parseCompatDate(implication.date);
					const dateOk = parsedDate >= implDate;

					// If both conditions are met, enable this flag
					if (allEnabled && dateOk) {
						result[flag.fieldName] = true;
						changed = true;
						break; // No need to check other implications for this flag
					}
				}
			}
		}
	}

	if (iterations >= MAX_ITERATIONS) {
		throw new Error(
			"Maximum iterations exceeded while resolving implied flags. This may indicate a circular dependency in the compatibility flag definitions."
		);
	}

	// The result object is built from FLAG_METADATA which contains all fields
	// from the CompatibilityFlags struct, so we can safely cast it
	return result as FeatureFlagsMap;
}
