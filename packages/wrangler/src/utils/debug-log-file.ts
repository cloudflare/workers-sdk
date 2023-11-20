import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Mutex } from "miniflare";
import onExit from "signal-exit";
import { findWranglerToml } from "../config";
import { getEnvironmentVariableFactory } from "../environment-variables/factory";
import { getBasePath } from "../paths";
import type { LoggerLevel } from "../logger";

const getDebugFileDir = getEnvironmentVariableFactory({
	variableName: "WRANGLER_LOG_PATH",
	defaultValue() {
		const configPath = findWranglerToml();
		const configDir = configPath ? path.dirname(configPath) : getBasePath();

		return path.join(configDir, ".wrangler", "debug-logs");
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
		: path.join(dir, `wrangler-debug-${date}.log`);

	// use path.resolve to allow the user-provided env var to be a relative path
	return path.resolve(filepath);
}

async function ensureDirectoryExists(filepath: string) {
	const dirpath = path.dirname(filepath);

	await mkdir(dirpath, { recursive: true });
}

export const debugLogFilepath = getDebugFilepath();
const mutex = new Mutex();

let hasLoggedLocation = false;
let hasLoggedError = false;

/**
 * Appends a message to the log file after waiting for pending writes to complete
 */
export async function appendToDebugLogFile(
	messageLevel: LoggerLevel,
	message: string
) {
	const entry = `
--- ${new Date().toISOString()} ${messageLevel}
${message}
---
`;

	if (!hasLoggedLocation) {
		hasLoggedLocation = true;
		const relativeFilepath = path.relative(process.cwd(), debugLogFilepath);
		console.info(`🐛 Writing debug logs to "${relativeFilepath}"`);
		onExit(() => {
			console.info(`🐛 Debug logs were written to "${relativeFilepath}"`);
		});
	}

	await mutex.runWith(async () => {
		try {
			await ensureDirectoryExists(debugLogFilepath);
			await appendFile(debugLogFilepath, entry);
		} catch (err) {
			if (!hasLoggedError) {
				hasLoggedError = true;
				console.error(`Failed to write to debug log file`, err);
				console.error(`Would have written:`, entry);
			}
		}
	});
}

/**
 * Reads the current log file after waiting for all pending writes
 */
export function readDebugLogFile(): Promise<string> {
	return mutex.runWith(() => readFile(debugLogFilepath, "utf-8"));
}
