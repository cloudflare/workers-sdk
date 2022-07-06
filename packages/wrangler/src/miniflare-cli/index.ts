import { Log, LogLevel, Miniflare } from "miniflare";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { enumKeys } from "./enum-keys";
import { getRequestContextCheckOptions } from "./request-context";

// miniflare defines this but importing it throws:
// Dynamic require of "path" is not supported
class NoOpLog extends Log {
	log(): void {}

	error(message: Error): void {
		throw message;
	}
}

async function main() {
	const args = await yargs(hideBin(process.argv))
		.help(false)
		.version(false)
		.option("log", {
			choices: enumKeys(LogLevel),
		}).argv;

	const logLevel = LogLevel[args.log ?? "INFO"];
	const requestContextCheckOptions = await getRequestContextCheckOptions();
	const config = {
		...JSON.parse((args._[0] as string) ?? "{}"),
		...requestContextCheckOptions,
	};
	//miniflare's logLevel 0 still logs routes, so lets override the logger
	config.log = config.disableLogs ? new NoOpLog() : new Log(logLevel);

	if (logLevel > LogLevel.INFO) {
		console.log("OPTIONS:\n", JSON.stringify(config, null, 2));
	}

	const mf = new Miniflare(config);

	try {
		// Start Miniflare development server
		await mf.startServer();
		await mf.startScheduler();
		process.send && process.send("ready");
	} catch (e) {
		mf.log.error(e as Error);
		process.exitCode = 1;
		// Unmount any mounted workers
		await mf.dispose();
	}
}

await main();
