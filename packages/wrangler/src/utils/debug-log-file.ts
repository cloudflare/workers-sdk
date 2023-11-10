import path from "node:path";
import { format } from "node:util";
import { appendFile } from "node:fs/promises";
import { getEnvironmentVariableFactory } from "../environment-variables/factory";
import { getBasePath } from "../paths";
import { logger } from "../logger";
import { Mutex } from "miniflare";
import onExit from "signal-exit";

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
			`wrangler-debug-${date}.log`
		);
		const relativeFilepath = path.relative(process.cwd(), absoluteFilepath);

		return relativeFilepath;
	},
});

const debugLogFilepath = getDebugFilepath();
const mutex = new Mutex();

let hasScheduledLocationLog = false;
let hasLoggedError = false;

export async function appendToDebugLogFile(...args: unknown[]) {
	const entry = `
--- ${new Date().toISOString()}
${format(...args)}
---
`;

	await mutex.runWith(() =>
		appendFile(debugLogFilepath, entry).catch((err) => {
			if (hasLoggedError) return;
			hasLoggedError = true;
			logger.error(`Failed to write to debug log file`, err);
		})
	);

	if (hasScheduledLocationLog) return;
	hasScheduledLocationLog = true;
	onExit(() => {
		logger.info(`🐛 Writing debug logs to "${debugLogFilepath}"`);
	});
}
