/**
 * Base class for errors where the user has done something wrong. These are not
 * reported to Sentry. API errors are intentionally *not* `UserError`s, and are
 * reported to Sentry. This will help us understand which API errors need better
 * messaging.
 */
export class UserError extends Error {
	constructor(...args: ConstructorParameters<typeof Error>) {
		super(...args);
		// Restore prototype chain:
		// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#support-for-newtarget
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

export class DeprecationError extends UserError {
	constructor(message: string) {
		super(`Deprecation:\n${message}`);
	}
}

export class FatalError extends UserError {
	constructor(
		message?: string,
		readonly code?: number
	) {
		super(message);
	}
}

export class CommandLineArgsError extends UserError {}

/**
 * JsonFriendlyFatalError is used to output JSON when wrangler crashes, useful for --json mode.
 *
 * To use, pass stringify'd json into the constructor like so:
 * ```js
 * throw new JsonFriendlyFatalError(JSON.stringify({ error: messageToDisplay });
 * ```
 */
export class JsonFriendlyFatalError extends FatalError {
	constructor(
		message?: string,
		readonly code?: number
	) {
		super(message);
	}
}

export class MissingConfigError extends Error {
	constructor(key: string) {
		super(`Missing config value for ${key}`);
	}
}

/**
 * Create either a FatalError or JsonFriendlyFatalError depending upon `isJson` parameter.
 *
 * If `isJson` is true, then the `message` is JSON stringified.
 */
export function createFatalError(
	message: unknown,
	isJson: boolean,
	code?: number
): Error {
	if (isJson) {
		return new JsonFriendlyFatalError(JSON.stringify(message), code);
	} else {
		return new FatalError(`${message}`, code);
	}
}
