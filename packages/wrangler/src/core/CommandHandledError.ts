/**
 * A wrapper that indicates the original error was thrown from a command handler
 * that has already sent telemetry (started + errored events).
 *
 * When this error is caught in index.ts, the outer error handler should:
 * 1. NOT send fallback telemetry (it's already been sent)
 * 2. Unwrap and rethrow the original error for proper error handling/display
 *
 * This is used to distinguish between:
 * - Errors from command handlers (telemetry sent by handler)
 * - Yargs validation errors (telemetry needs to be sent by fallback handler)
 */
export class CommandHandledError {
	constructor(public readonly originalError: unknown) {}
}
