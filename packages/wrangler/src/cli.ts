import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "process";
import { hideBin } from "yargs/helpers";
import { unstable_dev, unstable_pages } from "./api";
import { FatalError } from "./errors";
import { logger } from "./logger";
import { main } from ".";

import type { UnstableDevWorker, UnstableDevOptions } from "./api";
/**
 * The main entrypoint for the CLI.
 * main only gets called when the script is run directly, not when it's imported as a module.
 */
if (typeof jest === "undefined" && require.main === module) {
	main(hideBin(process.argv)).catch((e) => {
		// Dump debug logs on crash
		const errorLogPath = path.resolve("wrangler-error.log");
		console.error(`Writing debug logs to ${errorLogPath}`);
		writeFileSync(errorLogPath, logger.debugLogs.join("\n"));
		// The logging of any error that was thrown from `main()` is handled in the `yargs.fail()` handler.
		// Here we just want to ensure that the process exits with a non-zero code.
		// We don't want to do this inside the `main()` function, since that would kill the process when running our tests.
		const exitCode = (e instanceof FatalError && e.code) || 1;
		process.exit(exitCode);
	});
}

/**
 * This is how we're exporting the API.
 * It makes it possible to import wrangler from 'wrangler',
 * and call wrangler.unstable_dev().
 */
export { unstable_dev, unstable_pages };
export type { UnstableDevWorker, UnstableDevOptions };
