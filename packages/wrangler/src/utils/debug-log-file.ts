import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Mutex } from "miniflare";
import { getEnvironmentVariableFactory } from "../environment-variables/factory";
import { getBasePath } from "../paths";
import type { LoggerLevel } from "../logger";

const getDebugFilepath = getEnvironmentVariableFactory({
	variableName: "WRANGLER_DEBUG_LOG",
	defaultValue: () => {
		const date = new Date()
			.toISOString()
			.replaceAll(":", "-")
			.replace(".", "_")
			.replace("T", "_")
			.replace("Z", "");
		const absoluteFilepath = path.join(
			getBasePath(),
			".wrangler",
			"debug-logs",
			`wrangler-debug-${date}.log`
		);

		return absoluteFilepath;
	},
});

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

	await mutex.runWith(async () => {
		try {
			await ensureDirectoryExists(debugLogFilepath);
			await appendFile(debugLogFilepath, entry);
		} catch (err) {
			if (hasLoggedError) return;
			hasLoggedError = true;
			console.error(`Failed to write to debug log file`, err);
			console.error(`Would have written:`, entry);
		}
	});

	if (hasLoggedLocation) return;
	hasLoggedLocation = true;
	const relativeFilepath = path.relative(process.cwd(), debugLogFilepath);
	console.info(`🐛 Writing debug logs to "${relativeFilepath}"`);
	// TODO: move this into an exit hook so it isn't the first thing logged
}

/**
 * Reads the current log file after waiting for all pending writes
 */
export function readDebugLogFile(): Promise<string> {
	return mutex.runWith(() => readFile(debugLogFilepath, "utf-8"));
}
