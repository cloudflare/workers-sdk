import { Log, LogLevel, Miniflare } from "miniflare";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import generateASSETSBinding from "./assets";
import { enumKeys } from "./enum-keys";
import { getRequestContextCheckOptions } from "./request-context";
import type { Options } from "./assets";

export interface EnablePagesAssetsServiceBindingOptions {
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
	config.log = config.disableLogs
		? new NoOpLog()
		: new Log(logLevel, config.logOptions);

	if (logLevel > LogLevel.INFO) {
		console.log("OPTIONS:\n", JSON.stringify(config, null, 2));
	}

	let mf: Miniflare | undefined;

	try {
		if (args._[1]) {
			const opts: EnablePagesAssetsServiceBindingOptions = JSON.parse(
				args._[1] as string
			);

			if (isNaN(opts.proxyPort || NaN) && !opts.directory) {
				throw new Error(
					"MiniflareCLIOptions: built in service bindings set to true, but no port or directory provided"
				);
			}

			const options: Options = {
				log: config.log,
				proxyPort: opts.proxyPort,
				directory: opts.directory,
			};

			config.serviceBindings = {
				...config.serviceBindings,
				ASSETS: await generateASSETSBinding(options),
			};
		}
		mf = new Miniflare(config);
		// Start Miniflare development server
		await mf.startServer();
		await mf.startScheduler();
		process.send && process.send("ready");
	} catch (e) {
		mf?.log.error(e as Error);
		process.exitCode = 1;
		// Unmount any mounted workers
		await mf?.dispose();
	}
}

await main();
