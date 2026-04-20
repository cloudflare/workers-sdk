import { appendFile } from "node:fs/promises";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import {
	getEnvironmentVariableFactory,
	getGlobalWranglerConfigPath,
} from "@cloudflare/workers-utils";
import { Mutex } from "miniflare";
import onExit from "signal-exit";
import { logger } from "../logger";
import { ensureDirectoryExists } from "./filesystem";
import type { LoggerLevel } from "../logger";

const getDebugFileDir = getEnvironmentVariableFactory({
	variableName: "WRANGLER_LOG_PATH",
	defaultValue() {
		const gobalWranglerConfigDir = getGlobalWranglerConfigPath();

		return path.join(gobalWranglerConfigDir, "logs");
	},
});

function getDebugFilepath() {
	const dir = getDebugFileDir();

	const date = new Date()
		.toISOString()
		.replaceAll(":", "-")
		.replace(".", "_")
		.replace("T", "_")
		.replace("Z", "");

	const filepath = dir.endsWith(".log")
		? dir // allow the user to provide an exact filepath
		: path.join(dir, `wrangler-${date}.log`);

	// use path.resolve to allow the user-provided env var to be a relative path
	return path.resolve(filepath);
}

export const debugLogFilepath = getDebugFilepath();
const mutex = new Mutex();

let hasLoggedLocation = false;
let hasLoggedError = false;
let hasSeenErrorMessage = false;

/**
 * Appends a message to the log file after waiting for pending writes to complete
 */
export async function appendToDebugLogFile(
	messageLevel: LoggerLevel,
	message: string
) {
	const entry = `
--- ${new Date().toISOString()} ${messageLevel}
${stripVTControlCharacters(message)}
---
`;

	if (!hasLoggedLocation) {
		hasLoggedLocation = true;
		logger.debug(`🪵  Writing logs to "${debugLogFilepath}"`); // use logger.debug here to not show this message by default -- since logging to a file is no longer opt-in
		onExit(() => {
			// only print the log file location if the log file contains an error message
			// TODO(consider): recommend opening an issue with the contents of this file?
			if (hasSeenErrorMessage) {
				// use console.*warn* here so not to pollute stdout -- some commands print json to stdout
				// use logger.*console*("warn", ...) here so not to have include the *very* visible bright-yellow [WARNING] indicator
				logger.console(
					"warn",
					`🪵  Logs were written to "${debugLogFilepath}"`
				);
			}
		});
	}

	if (!hasSeenErrorMessage) {
		// TODO(consider): adding `|| messageLevel === "warn"`
		hasSeenErrorMessage = messageLevel === "error";
	}

	await mutex.runWith(async () => {
		try {
			await ensureDirectoryExists(debugLogFilepath);
			await appendFile(debugLogFilepath, entry);
		} catch (err) {
			if (!hasLoggedError) {
				hasLoggedError = true;
				logger.error(`Failed to write to log file`, err);
				logger.error(`Would have written:`, entry);
			}
		}
	});
}
