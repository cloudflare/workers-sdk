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
	constructor(message?: string, readonly code?: number) {
		super(message);
	}
}
