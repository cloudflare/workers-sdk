import {
	Log,
	LogLevel,
	Miniflare,
	Response as MiniflareResponse,
	Request as MiniflareRequest,
} from "miniflare";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import generateASSETSBinding from "./assets";
import { enumKeys } from "./enum-keys";
import { getRequestContextCheckOptions } from "./request-context";
import type { Options } from "./assets";
import type { AddressInfo } from "net";

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
	let durableObjectsMf: Miniflare | undefined = undefined;
	let durableObjectsMfPort: number | undefined = undefined;

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

		const durableObjectClassNames = Object.values(
			config.durableObjects as Record<string, string>
		);

		if (durableObjectClassNames.length > 0) {
			durableObjectsMf = new Miniflare({
				host: config.host,
				script: `
				export default {
					fetch(request, env) {
						return env.DO.fetch(request)
					}
				}`,
				serviceBindings: {
					DO: async (request: MiniflareRequest) => {
						request = new MiniflareRequest(request);

						const className = request.headers.get(
							"x-miniflare-durable-object-class-name"
						);
						const idString = request.headers.get(
							"x-miniflare-durable-object-id"
						);
						request.headers.delete("x-miniflare-durable-object-class-name");
						request.headers.delete("x-miniflare-durable-object-id");
						// TODO: Host/URL

						if (!className || !idString) {
							return new MiniflareResponse(
								"[durable-object-proxy-err] Missing `x-miniflare-durable-object-class-name` or `x-miniflare-durable-object-id` headers.",
								{ status: 400 }
							);
						}

						const namespace = await mf?.getDurableObjectNamespace(className);
						const id = namespace?.idFromString(idString);

						if (!id) {
							return new MiniflareResponse(
								"[durable-object-proxy-err] Could not generate an ID. Possibly due to a mismatched DO class name and ID?",
								{ status: 500 }
							);
						}

						const stub = namespace?.get(id);

						if (!stub) {
							return new MiniflareResponse(
								"[durable-object-proxy-err] Could not generate a stub. Possibly due to a mismatched DO class name and ID?",
								{ status: 500 }
							);
						}

						return stub.fetch(request);
					},
				},
				modules: true,
			});
			const server = await durableObjectsMf.startServer();
			durableObjectsMfPort = (server.address() as AddressInfo).port;
		}

		process.send &&
			process.send(
				JSON.stringify({
					ready: true,
					durableObjectClassNames,
					durableObjectsPort: durableObjectsMfPort,
				})
			);
	} catch (e) {
		mf?.log.error(e as Error);
		process.exitCode = 1;
		// Unmount any mounted workers
		await mf?.dispose();
		await durableObjectsMf?.dispose();
	}
}

await main();
