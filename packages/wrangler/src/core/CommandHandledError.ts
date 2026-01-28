/**
 * A wrapper Error that indicates the original error was thrown during Command handler execution.
 *
 * This is used to distinguish between:
 * - Errors from within command handlers: telemetry and error reporting already sent by handler.
 * - Yargs validation errors: telemetry and error reporting needs to be sent in the yargs middleware.
 */
export class CommandHandledError {
	constructor(public readonly originalError: unknown) {}
}
