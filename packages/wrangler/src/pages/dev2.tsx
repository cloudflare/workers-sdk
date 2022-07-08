import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { watch } from "chokidar";
import { unstable_dev } from "../api";
import { FatalError } from "../errors";
import { logger } from "../logger";
import { buildFunctions } from "./build";
import { pagesBetaWarning } from "./utils";
import type { ArgumentsCamelCase, Argv } from "yargs";

type PagesDevArgs = {
	directory?: string;
	command?: string;
	local: boolean;
	port: number;
	proxy?: number; //.
	"script-path": string;
	binding?: (string | number)[];
	kv?: (string | number)[]; //.
	do?: (string | number)[]; //.
	"live-reload": boolean;
	"node-compat": boolean;
};

export function Options(yargs: Argv): Argv<PagesDevArgs> {
	return yargs
		.positional("directory", {
			type: "string",
			demandOption: undefined,
			description: "The directory of static assets to serve",
		})
		.positional("command", {
			type: "string",
			demandOption: undefined,
			description: "The proxy command to run",
		})
		.options({
			local: {
				type: "boolean",
				default: true,
				description: "Run on my machine",
			},
			port: {
				type: "number",
				default: 8788,
				description: "The port to listen on (serve from)",
			},
			proxy: {
				type: "number",
				description: "The port to proxy (where the static assets are served)",
			},
			"script-path": {
				type: "string",
				default: "_worker.js",
				description:
					"The location of the single Worker script if not using functions",
			},
			binding: {
				type: "array",
				description: "Bind variable/secret (KEY=VALUE)",
				alias: "b",
			},
			kv: {
				type: "array",
				description: "KV namespace to bind",
				alias: "k",
			},
			do: {
				type: "array",
				description: "Durable Object to bind (NAME=CLASS)",
				alias: "o",
			},
			"live-reload": {
				type: "boolean",
				default: false,
				description: "Auto reload HTML pages when change is detected",
			},
			"node-compat": {
				describe: "Enable node.js compatibility",
				default: false,
				type: "boolean",
				hidden: true,
			},
			config: {
				describe: "Pages does not support wrangler.toml",
				type: "string",
				hidden: true,
			},
			//   // TODO: Miniflare user options
		})
		.epilogue(pagesBetaWarning);
}

export async function Handler({
	local,
	directory,
	port,
	proxy: requestedProxyPort,
	"script-path": singleWorkerScriptPath,
	binding: bindings = [],
	kv: kvs = [],
	do: durableObjects = [],
	"live-reload": liveReload,
	"node-compat": nodeCompat,
	config,
	_: [_pages, _dev, ..._remaining],
}: ArgumentsCamelCase<PagesDevArgs>) {
	// Beta message for `wrangler pages <commands>` usage
	logger.log(pagesBetaWarning);

	if (!local) {
		throw new FatalError("Only local mode is supported at the moment.", 1);
	}

	if (config) {
		throw new FatalError("Pages does not support wrangler.toml", 1);
	}

	const kv = kvs.map((val) => ({
		binding: val.toString(),
		id: "",
	}));

	let scriptReadyResolve: () => void;
	const scriptReadyPromise = new Promise<void>(
		(promiseResolve) => (scriptReadyResolve = promiseResolve)
	);

	const functionsDirectory = "./functions";
	const usingFunctions = existsSync(functionsDirectory);

	if (directory) {
		directory = resolve(directory);
	}

	let scriptPath: string;
	if (usingFunctions) {
		const outfile = join(tmpdir(), `./functionsWorker-${Math.random()}.js`);
		scriptPath = outfile;

		if (nodeCompat) {
			console.warn(
				"Enabling node.js compatibility mode for builtins and globals. This is experimental and has serious tradeoffs. Please see https://github.com/ionic-team/rollup-plugin-node-polyfills/ for more details."
			);
		}

		logger.log(`Compiling worker to "${outfile}"...`);

		try {
			await buildFunctions({
				outfile,
				functionsDirectory,
				sourcemap: true,
				watch: true,
				onEnd: () => scriptReadyResolve(),
				buildOutputDirectory: directory,
				nodeCompat,
			});
		} catch {}

		watch([functionsDirectory], {
			persistent: true,
			ignoreInitial: true,
		}).on("all", async () => {
			await buildFunctions({
				outfile,
				functionsDirectory,
				sourcemap: true,
				watch: true,
				onEnd: () => scriptReadyResolve(),
				buildOutputDirectory: directory,
				nodeCompat,
			});
		});
	} else {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		scriptReadyResolve!();

		scriptPath =
			directory !== undefined
				? join(directory, singleWorkerScriptPath)
				: singleWorkerScriptPath;

		if (!existsSync(scriptPath)) {
			logger.log("No functions. Shimming...");
			scriptPath = resolve(__dirname, "../templates/pages-shim.ts");
		}
	}

	await scriptReadyPromise;

	//todo when this is not provided
	await unstable_dev(scriptPath, {
		port,
		showInteractiveDevSession: undefined,
		liveReload,
		nodeCompat,
		vars: Object.fromEntries(
			bindings
				.map((binding) => binding.toString().split("="))
				.map(([key, ...values]) => [key, values.join("=")])
		),
		kv,
		forceLocal: true,
		miniflareCLIOptions: {
			enableAssetsServiceBinding: true,
			proxyPort: requestedProxyPort,
			directory,
		},

		_: [],
		$0: "",
	});
}
