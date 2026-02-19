/**
 * The `CompatibilityFlagAssertions` class provides methods to validate compatibility flags and dates
 * within a project's configuration. It ensures that specific flags are either present
 * or absent and that compatibility dates meet the required criteria.
 */
export class CompatibilityFlagAssertions {
	#compatibilityDate?: string;
	#compatibilityFlags: string[];
	#optionsPath: string;
	#relativeProjectPath: string;
	#relativeWranglerConfigPath?: string;

	constructor(options: CommonOptions) {
		this.#compatibilityDate = options.compatibilityDate;
		this.#compatibilityFlags = options.compatibilityFlags;
		this.#optionsPath = options.optionsPath;
		this.#relativeProjectPath = options.relativeProjectPath;
		this.#relativeWranglerConfigPath = options.relativeWranglerConfigPath;
	}

	/**
	 * Checks if a specific flag is present in the compatibilityFlags array.
	 */
	#flagExists(flag: string): boolean {
		return this.#compatibilityFlags.includes(flag);
	}

	/**
	 * Constructs the base of the error message.
	 *
	 * @example
	 * In project /path/to/project
	 *
	 * @example
	 * In project /path/to/project's configuration file wrangler.toml
	 */
	#buildErrorMessageBase(): string {
		let message = `In project ${this.#relativeProjectPath}`;
		if (this.#relativeWranglerConfigPath) {
			message += `'s configuration file ${this.#relativeWranglerConfigPath}`;
		}
		return message;
	}

	/**
	 * Constructs the configuration path part of the error message.
	 */
	#buildConfigPath(setting: string): string {
		if (this.#relativeWranglerConfigPath) {
			return `\`${setting}\``;
		}

		const camelCaseSetting = setting.replace(/_(\w)/g, (_, letter) =>
			letter.toUpperCase()
		);

		return `\`${this.#optionsPath}.${camelCaseSetting}\``;
	}

	isEnabled(
		enableFlag: string,
		disableFlag: string,
		defaultOnDate?: string
	): boolean {
		if (this.#flagExists(disableFlag)) {
			return false;
		}
		return (
			this.#flagExists(enableFlag) ||
			isDateSufficient(this.#compatibilityDate, defaultOnDate)
		);
	}

	/**
	 * Ensures that a specific enable flag is present or that the compatibility date meets the required date.
	 */
	assertIsEnabled({
		enableFlag,
		disableFlag,
		defaultOnDate,
	}: {
		enableFlag: string;
		disableFlag: string;
		defaultOnDate?: string;
	}): AssertionResult {
		// If it's disabled by this flag, we can return early.
		if (this.#flagExists(disableFlag)) {
			const errorMessage = `${this.#buildErrorMessageBase()}, ${this.#buildConfigPath(
				"compatibility_flags"
			)} must not contain "${disableFlag}".\nThis flag is incompatible with \`@cloudflare/vitest-pool-workers\`.`;
			return { isValid: false, errorMessage };
		}

		const enableFlagPresent = this.#flagExists(enableFlag);
		const dateSufficient = isDateSufficient(
			this.#compatibilityDate,
			defaultOnDate
		);

		if (!enableFlagPresent && !dateSufficient) {
			let errorMessage = `${this.#buildErrorMessageBase()}, ${this.#buildConfigPath(
				"compatibility_flags"
			)} must contain "${enableFlag}"`;

			if (defaultOnDate) {
				errorMessage += `, or ${this.#buildConfigPath(
					"compatibility_date"
				)} must be >= "${defaultOnDate}".`;
			}

			errorMessage += `\nThis flag is required to use \`@cloudflare/vitest-pool-workers\`.`;

			return { isValid: false, errorMessage };
		}

		return { isValid: true };
	}

	/**
	 * Ensures that a any one of a given set of flags is present in the compatibility_flags array.
	 */
	assertAtLeastOneFlagExists(flags: string[]): AssertionResult {
		if (flags.length === 0 || flags.some((flag) => this.#flagExists(flag))) {
			return { isValid: true };
		}

		const errorMessage = `${this.#buildErrorMessageBase()}, ${this.#buildConfigPath(
			"compatibility_flags"
		)} must contain one of ${flags.map((flag) => `"${flag}"`).join("/")}.\nEither one of these flags is required to use \`@cloudflare/vitest-pool-workers\`.`;

		return { isValid: false, errorMessage };
	}
}

/**
 * Common options used across all assertion methods.
 */
interface CommonOptions {
	compatibilityDate?: string;
	compatibilityFlags: string[];
	optionsPath: string;
	relativeProjectPath: string;
	relativeWranglerConfigPath?: string;
}

/**
 * Result of an assertion method.
 */
interface AssertionResult {
	isValid: boolean;
	errorMessage?: string;
}

/**
 * Parses a date string into a Date object.
 */
function parseDate(dateStr: string): Date {
	const date = new Date(dateStr);
	if (isNaN(date.getTime())) {
		throw new Error(`Invalid date format: "${dateStr}"`);
	}
	return date;
}

/**
 * Checks if the compatibility date meets or exceeds the required date.
 */
function isDateSufficient(
	compatibilityDate?: string,
	defaultOnDate?: string
): boolean {
	if (!compatibilityDate || !defaultOnDate) {
		return false;
	}
	const compDate = parseDate(compatibilityDate);
	const reqDate = parseDate(defaultOnDate);
	return compDate >= reqDate;
}
