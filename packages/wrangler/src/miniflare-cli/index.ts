import { Log, LogLevel, Miniflare } from "miniflare";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import generateFunctions from "./assets";
import { enumKeys } from "./enum-keys";
import { getRequestContextCheckOptions } from "./request-context";
import type { Options } from "./assets";

export interface MiniflareCLIOptions {
	enableAssetsServiceBinding?: boolean;
	proxyPort?: number;
	directory?: string;
}

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

	let mf: Miniflare | undefined;
	try {
		if (args._[1]) {
			const opts: MiniflareCLIOptions = JSON.parse(args._[1] as string);
			if (opts.enableAssetsServiceBinding) {
				if (isNaN(opts.proxyPort as number) && !opts.directory) {
					throw new Error(
						"MiniflareCLIOptions: built in service bindings set to true, but no port or directory provided"
					);
				}
				const options: Options = {
					logger: config.log,
					proxyPort: opts.proxyPort,
					directory: opts.directory,
				};
				const ASSETS = await generateFunctions(options);
				config.serviceBindings = { ...config.serviceBindings, ASSETS };
			}
		}
		mf = new Miniflare(config);
		// Start Miniflare development server
		await mf.startServer();
		await mf.startScheduler();
		process.send && process.send("ready");
	} catch (e) {
		console.log(e);
		mf?.log.error(e as Error);
		process.exitCode = 1;
		// Unmount any mounted workers
		await mf?.dispose();
	}
}

await main();
