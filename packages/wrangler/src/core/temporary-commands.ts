import { CommandLineArgsError } from "@cloudflare/workers-utils";
import type { ArgDefinition } from "./types";

export const temporaryArgDefinition = {
	describe:
		"Create and use a temporary preview account when no Cloudflare credentials are available",
	type: "boolean",
	default: false,
	hidden: true,
} as const satisfies ArgDefinition;

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
} as const satisfies ArgDefinition;
