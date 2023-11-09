import path from "node:path";
import { format } from "node:util";
import { appendFile } from "node:fs/promises";
import { getEnvironmentVariableFactory } from "../environment-variables/factory";
import { getBasePath } from "../paths";
import { logger } from "../logger";
import { Mutex } from "miniflare";

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

let hasLoggedLocation = false;
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

	if (hasLoggedLocation) return;
	hasLoggedLocation = true;
	logger.info(`🐛 Writing debug logs to "${debugLogFilepath}"`);
	// TODO: move this into an exit hook so it isn't the first thing logged
}
