/**
 * Note: most of the code in this file has been copied from packages/wrangler/src/dev/miniflare/stdio.ts
 *       so these two files should ideally be kept as much in sync as possible
 *       (ideally we should have a way to share code between the two packages instead of duplicating
 *       code in this manner)
 */

import { LogLevel } from "miniflare";
import type { Log } from "miniflare";
import type { Readable } from "node:stream";

/**
 * Generates a handler function to pass to Miniflare instances for handling the Worker process stream.
 *
 * The generated function can be used when Miniflare's `structuredWorkerdLogs` option is set to `true`.
 *
 * @param logger The miniflare logger to use
 */
export function getRuntimeStdioWithStructuredLogsHandler(logger: Log) {
	return (stdout: Readable, stderr: Readable) => {
		stdout.on("data", getProcessStreamDataListener(logger, "stdout"));
		stderr.on("data", getProcessStreamDataListener(logger, "stderr"));
	};
}

/**
 * Creates a listener for the "data" event of a process stream associated to Miniflare's Workerd process.
 *
 * This function can be used when Miniflare's `structuredWorkerdLogs` option is set to `true`.
 *
 * @param processStream The target process stream
 * @returns the listener to set for the stream's "data" event
 */
function getProcessStreamDataListener(
	logger: Log,
	processStream: "stdout" | "stderr"
) {
	let streamAccumulator = "";

	return (chunk: Buffer | string) => {
		const fullStreamOutput = `${streamAccumulator}${chunk}`;

		let currentLogsStr = "";

		// Structured logs are divided by newlines so let's get the
		// last one, we know that anything in between will include
		// one or more structured logs
		const lastNewlineIdx = fullStreamOutput.lastIndexOf("\n");

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
			const structuredLog = parseStructuredLog(line);
			if (structuredLog) {
				logStructuredLog(logger, structuredLog, processStream);
			} else {
				// Unexpectedly we've received a line that is not a structured log, so we simply
				// log it to the most likely appropriate logger level
				if (processStream === "stdout") {
					logger.info(line);
				} else {
					logger.logWithLevel(LogLevel.ERROR, line);
				}
			}
		}
	};
}

type WorkerdStructuredLog = {
	timestamp: number;
	level: string;
	message: string;
};

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

		const timestamp = parseInt(maybeStructuredLog.timestamp ?? "");

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
		return null;
	}
}

/**
 * Logs a structured log in the most appropriate way on the most appropriate log level.
 *
 * @param structuredLog The structured log to print
 * @param processStream The process stream from where the structured log comes from
 */
function logStructuredLog(
	logger: Log,
	{ level, message }: WorkerdStructuredLog,
	processStream: "stdout" | "stderr"
): void {
	// TODO: the following code analyzes the message without considering its log level,
	//       ideally, in order to avoid false positives, we should run this logic scoped
	//       to the relevant log levels (as we do for `isCodeMovedWarning`)
	if (messageClassifiers.isBarf(message)) {
		// this is a big chonky barf from workerd that we want to hijack to cleanup/ignore

		// CLEANABLE:
		// known case to cleanup: Address in use errors
		if (messageClassifiers.isAddressInUse(message)) {
			const address = message.match(
				/Address already in use; toString\(\) = (.+)\n/
			)?.[1];

			logger.logWithLevel(
				LogLevel.ERROR,
				`Address already in use (${address}). Please check that you are not already running a server on this address or specify a different port with --port.`
			);

			// Also log the original error to the debug logs.
			return logger.info(message);
		}

		// In the past we have seen Access Violation errors on Windows, which may be caused by an outdated
		// version of the Windows OS or the Microsoft Visual C++ Redistributable.
		// See https://github.com/cloudflare/workers-sdk/issues/6170#issuecomment-2245209918
		if (messageClassifiers.isAccessViolation(message)) {
			let error = "There was an access violation in the runtime.";
			if (process.platform === "win32") {
				error +=
					"\nOn Windows, this may be caused by an outdated Microsoft Visual C++ Redistributable library.\n" +
					"Check that you have the latest version installed.\n" +
					"See https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist.";
			}

			logger.logWithLevel(LogLevel.ERROR, error);

			// Also log the original error to the debug logs.
			return logger.info(message);
		}

		// IGNORABLE:
		// anything else not handled above is considered ignorable
		// so send it to the debug logs which are discarded unless
		// the user explicitly sets a logLevel indicating they care
		return logger.info(message);
	}

	if (
		(level === "info" || level === "error") &&
		messageClassifiers.isCodeMovedWarning(message)
	) {
		// known case: "error: CODE_MOVED for unknown code block?", warning for workerd devs, not application devs
		// ignore entirely, don't even send it to the debug log file
		// workerd references:
		// 	- https://github.com/cloudflare/workerd/blob/d170f4d9b/src/workerd/jsg/setup.c%2B%2B#L566
		//  - https://github.com/cloudflare/workerd/blob/d170f4d9b/src/workerd/jsg/setup.c%2B%2B#L572
		return;
	}

	if (level === "warn") {
		return logger.warn(message);
	}

	if (level === "info" || level === "debug") {
		return logger.info(message);
	}

	if (level === "error") {
		return logger.logWithLevel(LogLevel.ERROR, message);
	}

	if (processStream === "stderr") {
		return logger.logWithLevel(LogLevel.ERROR, message);
	} else {
		return logger.info(message);
	}
}

const messageClassifiers = {
	// Is this chunk a big chonky barf from workerd that we want to hijack to cleanup/ignore?
	isBarf(chunk: string) {
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
};
