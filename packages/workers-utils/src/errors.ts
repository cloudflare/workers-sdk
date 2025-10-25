/**
 * This is used to provide telemetry with a sanitised error
 * message that could not have any user-identifying information.
 * Set to `true` to duplicate `message`.
 *  */
export type TelemetryMessage = {
	telemetryMessage?: string | true;
};
/**
 * Base class for errors where the user has done something wrong. These are not
 * reported to Sentry. API errors are intentionally *not* `UserError`s, and are
 * reported to Sentry. This will help us understand which API errors need better
 * messaging.
 */
export class UserError extends Error {
	telemetryMessage: string | undefined;
	constructor(
		message?: string | undefined,
		options?: (ErrorOptions & TelemetryMessage) | undefined
	) {
		super(message, options);
		// Restore prototype chain:
		// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#support-for-newtarget
		Object.setPrototypeOf(this, new.target.prototype);
		this.telemetryMessage =
			options?.telemetryMessage === true ? message : options?.telemetryMessage;
	}
}

export class DeprecationError extends UserError {
	constructor(message: string, options?: TelemetryMessage) {
		super(`Deprecation:\n${message}`, options);
	}
}

export class FatalError extends UserError {
	constructor(
		message?: string,
		readonly code?: number | undefined,
		options?: TelemetryMessage
	) {
		super(message, options);
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
		readonly code?: number,
		options?: TelemetryMessage
	) {
		super(message, code, options);
	}
}

export class MissingConfigError extends Error {
	telemetryMessage: string | undefined;
	constructor(key: string) {
		super(`Missing config value for ${key}`);
		this.telemetryMessage = `Missing config value for ${key}`;
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
	code?: number,
	telemetryMessage?: TelemetryMessage
): Error {
	if (isJson) {
		return new JsonFriendlyFatalError(
			JSON.stringify(message),
			code,
			telemetryMessage
		);
	} else {
		return new FatalError(`${message}`, code, telemetryMessage);
	}
}
