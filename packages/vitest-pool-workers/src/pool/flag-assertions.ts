/**
 * The `FlagAssertions` class provides methods to validate compatibility flags and dates
 * within a project's configuration. It ensures that specific flags are either present
 * or absent and that compatibility dates meet the required criteria.
 */
export class FlagAssertions {
	#compatibilityFlags: string[];
	#optionsPath: string;
	#relativeProjectPath: string;
	#relativeWranglerConfigPath?: string;

	constructor(options: CommonOptions) {
		this.#compatibilityFlags = options.compatibilityFlags;
		this.#optionsPath = options.optionsPath;
		this.#relativeProjectPath = options.relativeProjectPath;
		this.#relativeWranglerConfigPath = options.relativeWranglerConfigPath;
	}

	/**
	 * Checks if a specific flag is present in the compatibilityFlags array.
	 */
	private isFlagPresent(flag: string): boolean {
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

	/**
	 * Ensures that a specific disable flag is not present.
	 */
	assertDisableFlagNotPresent(flag: string): AssertionResult {
		if (this.isFlagPresent(flag)) {
			const errorMessage = `${this.#buildErrorMessageBase()}, ${this.#buildConfigPath(
				"compatibility_flags"
			)} must not contain "${flag}".\nThis flag is incompatible with \`@cloudflare/vitest-pool-workers\`.`;
			return { isValid: false, errorMessage };
		}

		return { isValid: true };
	}

	/**
	 * Ensures that a specific enable flag is present or that the compatibility date meets the required date.
	 */
	assertEnableFlagOrCompatibilityDate(
		flag: string,
		options: DateOptions
	): AssertionResult {
		const { defaultOnDate, compatibilityDate } = options;

		const flagPresent = this.isFlagPresent(flag);
		const dateSufficient = isDateSufficient(compatibilityDate, defaultOnDate);

		if (!flagPresent && !dateSufficient) {
			const errorMessage = `${this.#buildErrorMessageBase()}, ${this.#buildConfigPath(
				"compatibility_flags"
			)} must contain "${flag}", or ${this.#buildConfigPath(
				"compatibility_date"
			)} must be >= "${defaultOnDate}".\nThis flag is required to use \`@cloudflare/vitest-pool-workers\`.`;
			return { isValid: false, errorMessage };
		}

		return { isValid: true };
	}

	/**
	 * Ensures that a any one of a given set of flags is present.
	 */
	assertUnionOfEnableFlags(flags: string[]): AssertionResult {
		if (flags.some((flag) => this.isFlagPresent(flag))) {
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
	compatibilityFlags: string[];
	optionsPath: string;
	relativeProjectPath: string;
	relativeWranglerConfigPath?: string;
}

/**
 * Options specific to date-related assertions.
 */
interface DateOptions {
	compatibilityDate?: string;
	defaultOnDate: string;
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
