/**
 * Error thrown when an operation is cancelled
 */
export class CancelError extends Error {
	constructor(
		message?: string,
		readonly signal?: NodeJS.Signals
	) {
		super(message);
	}
}
