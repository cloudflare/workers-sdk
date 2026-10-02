import { APIError, CommandLineArgsError } from "@cloudflare/workers-utils";

export const temporaryArgDefinition = {
	describe:
		"Create and use a temporary preview account when no Cloudflare credentials are available",
	type: "boolean",
	default: false,
	hidden: true,
} as const;

/**
 * Normalizes the `--event-code` value, rejecting repeated or blank codes.
 *
 * Errors never include the code itself, because it is a shared secret for the event.
 *
 * @param value The raw value parsed by yargs.
 * @returns The trimmed event code.
 */
function parseEventCode(value: string | string[]): string {
	if (Array.isArray(value)) {
		throw new CommandLineArgsError("--event-code expects a single value.", {
			telemetryMessage: "temporary event code multiple values",
		});
	}

	const eventCode = value.trim();
	if (!eventCode) {
		throw new CommandLineArgsError("--event-code cannot be empty.", {
			telemetryMessage: "temporary event code empty",
		});
	}

	return eventCode;
}

export const eventCodeArgDefinition = {
	describe: "Create a temporary account for an event",
	type: "string",
	requiresArg: true,
	hidden: true,
	coerce: parseEventCode,
} as const;

/**
 * Rejects `--event-code` unless `--temporary` is also set, so an event code can
 * never be silently ignored on a command that would use real credentials.
 *
 * @param args The parsed command arguments.
 */
export function validateTemporaryArgs(args: {
	temporary?: unknown;
	eventCode?: unknown;
}): void {
	if (args.eventCode && !args.temporary) {
		throw new CommandLineArgsError("--event-code requires --temporary.", {
			telemetryMessage: "temporary event code temporary required",
		});
	}
}

/** R2 v4 API error code for an account without the `r2.enabled` entitlement. */
const R2_NOT_ENTITLED_CODE = 10042;

/**
 * Adds a note to R2 permission errors hit through `--temporary`.
 *
 * Ordinary temporary accounts are not entitled to R2 and their token lacks R2
 * permissions; only accounts created with `--event-code` can use it. The
 * temporary-account cache cannot tell the two apart, so the note is phrased
 * conditionally.
 *
 * @param command The full command name, e.g. `wrangler r2 bucket create`.
 * @param err The error thrown by the command handler.
 */
export function addTemporaryEventAccountHint(
	command: string,
	err: unknown
): void {
	if (
		command.startsWith("wrangler r2 ") &&
		err instanceof APIError &&
		(err.code === R2_NOT_ENTITLED_CODE || err.status === 403)
	) {
		err.notes.push({
			text: "R2 is only available on temporary accounts created for an event. If this account was not created with `--event-code`, run `wrangler logout` and rerun this command with `--temporary --event-code <code>`.",
		});
	}
}
