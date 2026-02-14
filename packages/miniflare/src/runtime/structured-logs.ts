import { bold, green, grey, red, reset, yellow } from "kleur/colors";
import { WorkerdStructuredLog } from "../plugins/core";
import type { Stream } from "node:stream";

export type StructuredLogsHandler = (
	structuredLog: WorkerdStructuredLog
) => void;

/**
 * Regex pattern to detect Durable Object alarm execution logs from workerd.
 * Workerd logs alarm executions with a pattern like:
 * "Durable Object '<className>' alarm starting" or
 * "Durable Object alarm running for <className>"
 * This pattern captures the class name and any relevant timing/status info.
 */
const ALARM_PATTERN =
	/Durable Object\s*'?([^'\s]+)'?\s*(alarm|Alarm)\s*(starting|running|completed|failed|scheduled)/i;

/**
 * Handles the structured logs emitted by a given stream
 *
 * @param stream The target stream
 * @param structuredLogsHandler The handler function to use to process the structured logs
 */
export function handleStructuredLogsFromStream(
	stream: Stream,
	structuredLogsHandler: StructuredLogsHandler
) {
	let streamAccumulator = "";

	stream.on("data", (chunk: Buffer | string) => {
		const fullStreamOutput = `${streamAccumulator}${chunk}`;

		let currentLogsStr = "";

		// Structured logs are divided by newlines so let's get the
		// last one, we know that anything in between will include
		// one or more structured logs
		const lastNewlineIdx = fullStreamOutput.lastIndexOf("\n");

		const adjustedStructuredLogsHandler = wrapStructuredLogsHandler(
			structuredLogsHandler
		);

		if (lastNewlineIdx > 0) {
			// If we've found a newline we will take the structured logs
			// up to that point, the rest (which is the beginning of a
			// new structured log) will be saved for later
			currentLogsStr = fullStreamOutput.slice(0, lastNewlineIdx);
			streamAccumulator = fullStreamOutput.slice(lastNewlineIdx + 1);
		} else {
			// If we didn't find a newline we're dealing with a structured
			// log that has been split, so let's save the whole thing for
			// later (so that we can process the log once we've seen it
			// in full)
			streamAccumulator = fullStreamOutput;
		}

		const lines = currentLogsStr.split("\n");

		for (const line of lines) {
			if (!line) {
				continue;
			}
			const structuredLog = parseStructuredLog(line);
			if (structuredLog) {
				adjustedStructuredLogsHandler(structuredLog);
			}
		}
	});
}

const messageClassifiers = {
	// Is this chunk an internal message from workerd that we want to hijack to cleanup/ignore?
	isInternal(chunk: string) {
		const containsLlvmSymbolizerWarning = chunk.includes(
			"Not symbolizing stack traces because $LLVM_SYMBOLIZER is not set"
		);
		const containsRecursiveIsolateLockWarning = chunk.includes(
			"took recursive isolate lock"
		);
		// Matches stack traces from workerd
		//  - on unix: groups of 9 hex digits separated by spaces
		//  - on windows: groups of 12 hex digits, or a single digit 0, separated by spaces
		const containsHexStack = /stack:( (0|[a-f\d]{4,})){3,}/.test(chunk);

		return (
			containsLlvmSymbolizerWarning ||
			containsRecursiveIsolateLockWarning ||
			containsHexStack
		);
	},
	// Is this chunk an Address In Use error?
	isAddressInUse(chunk: string) {
		return chunk.includes("Address already in use; toString() = ");
	},
	isCodeMovedWarning(chunk: string) {
		return /CODE_MOVED for unknown code block/.test(chunk);
	},
	isAccessViolation(chunk: string) {
		return chunk.includes("access violation;");
	},
	// Is this chunk a Durable Object alarm log?
	isAlarmLog(chunk: string) {
		return ALARM_PATTERN.test(chunk);
	},
};

/**
 * Formats a Durable Object alarm log message for better readability.
 * Takes a raw workerd alarm log and formats it similar to request logs.
 *
 * @param message The raw alarm log message from workerd
 * @returns A formatted, colorized alarm log message, or null if not an alarm log
 */
export function formatAlarmLog(message: string): string | null {
	const alarmMatch = ALARM_PATTERN.exec(message);
	if (alarmMatch) {
		const className = alarmMatch[1];
		const status = alarmMatch[3].toLowerCase();

		let statusColor: typeof green;
		let statusText: string;
		switch (status) {
			case "starting":
			case "running":
			case "scheduled":
				statusColor = yellow;
				statusText = status.charAt(0).toUpperCase() + status.slice(1);
				break;
			case "completed":
				statusColor = green;
				statusText = "Ok";
				break;
			case "failed":
				statusColor = red;
				statusText = "Failed";
				break;
			default:
				statusColor = grey;
				statusText = status;
		}

		return reset(
			[bold("DO Alarm"), ` ${className} - `, statusColor(statusText)].join("")
		);
	}

	return null;
}

/**
 * Wraps a structuredLogsHandler function so that it then performs extra filtering and
 * remapping of logs so that known unhelpful/noisy logs are improved or removed altogether
 *
 * @param structuredLogsHandler The target handler function to improve
 * @returns The improved handler function
 */
function wrapStructuredLogsHandler(
	structuredLogsHandler: StructuredLogsHandler
) {
	return (structuredLog: WorkerdStructuredLog) => {
		// TODO: the following code analyzes the message without considering its log level,
		//       ideally, in order to avoid false positives, we should run this logic scoped
		//       to the relevant log levels (as we do for `isCodeMovedWarning`)
		if (messageClassifiers.isInternal(structuredLog.message)) {
			// this is an internal message from workerd that we want to hijack to cleanup/ignore

			// CLEANABLE:
			// known case to cleanup: Address in use errors
			if (messageClassifiers.isAddressInUse(structuredLog.message)) {
				// Miniflare handles startup failures that result in an address in use message
				// and will turn them into thrown MiniflareCoreErrors. As such, don't show the log to
				// the user, or they'd see it twice
				return;
			}

			// In the past we have seen Access Violation errors on Windows, which may be caused by an outdated
			// version of the Windows OS or the Microsoft Visual C++ Redistributable.
			// See https://github.com/cloudflare/workers-sdk/issues/6170#issuecomment-2245209918
			if (messageClassifiers.isAccessViolation(structuredLog.message)) {
				let error = "There was an access violation in the runtime.";
				if (process.platform === "win32") {
					error +=
						"\nOn Windows, this may be caused by an outdated Microsoft Visual C++ Redistributable library.\n" +
						"Check that you have the latest version installed.\n" +
						"See https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist.";
				}

				return structuredLogsHandler({
					timestamp: structuredLog.timestamp,
					level: "error",
					message: error,
				});
			}

			// IGNORABLE:
			// anything else not handled above is considered ignorable
			return;
		}

		if (
			(structuredLog.level === "info" || structuredLog.level === "error") &&
			messageClassifiers.isCodeMovedWarning(structuredLog.message)
		) {
			// known case: "error: CODE_MOVED for unknown code block?", warning for workerd devs, not application devs
			// ignore entirely, don't even send it to the debug log file
			// workerd references:
			// 	- https://github.com/cloudflare/workerd/blob/d170f4d9b/src/workerd/jsg/setup.c%2B%2B#L566
			//  - https://github.com/cloudflare/workerd/blob/d170f4d9b/src/workerd/jsg/setup.c%2B%2B#L572
			return;
		}

		// Check for Durable Object alarm logs and format them nicely
		// The ALARM_PATTERN requires "Durable Object" prefix so it won't match user logs
		if (messageClassifiers.isAlarmLog(structuredLog.message)) {
			const formattedMessage = formatAlarmLog(structuredLog.message);
			if (formattedMessage) {
				return structuredLogsHandler({
					timestamp: structuredLog.timestamp,
					level: "info",
					message: formattedMessage,
				});
			}
		}

		return structuredLogsHandler(structuredLog);
	};
}

/**
 * Parses a string to obtain the potential structured log the string represents.
 *
 * @param str Target string
 * @returns The structured log extracted from the string or null is the string doesn't represent a structured log
 */
function parseStructuredLog(str: string): WorkerdStructuredLog | null {
	try {
		const maybeStructuredLog = JSON.parse(str) as Record<string, string>;

		if (typeof maybeStructuredLog !== "object" || maybeStructuredLog === null) {
			return null;
		}

		const timestamp = parseInt(maybeStructuredLog.timestamp);

		if (
			isNaN(timestamp) ||
			typeof maybeStructuredLog.level !== "string" ||
			typeof maybeStructuredLog.message !== "string"
		) {
			return null;
		}

		return {
			timestamp,
			level: maybeStructuredLog.level,
			message: maybeStructuredLog.message,
		};
	} catch {
		// Unexpectedly we've received a line that is not a structured log.
		// For now we simply log it at the log level, if this turns out problematic we can refine this as needed.
		return {
			timestamp: Date.now(),
			level: "log",
			message: str,
		};
	}
}
