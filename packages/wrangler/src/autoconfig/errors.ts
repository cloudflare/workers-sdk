/**
 * This is used to provide telemetry with a sanitised error
 * message that could not have any user-identifying information.
 * Set to `true` to duplicate `message`.
 *  */
type TelemetryMessage = {
	telemetryMessage?: string | true;
};

/**
 * Base class for errors where something in a autoconfig frameworks' configuration goes
 * something wrong. These are not reported to Sentry.
 */
export class AutoConfigFrameworkConfigurationError extends Error {
	telemetryMessage: string | undefined;
	constructor(
		message?: string | undefined,
		options?:
			| ({
					cause?: unknown;
			  } & TelemetryMessage)
			| undefined
	) {
		super(message, options);
		// Restore prototype chain:
		// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#support-for-newtarget
		Object.setPrototypeOf(this, new.target.prototype);
		this.telemetryMessage =
			options?.telemetryMessage === true ? message : options?.telemetryMessage;
	}
}
