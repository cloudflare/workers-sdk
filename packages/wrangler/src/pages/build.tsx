import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { toUrlPath } from "../paths";
import { isInPagesCI } from "./constants";
import { buildPlugin } from "./functions/buildPlugin";
import { buildWorker } from "./functions/buildWorker";
import { generateConfigFromFileTree } from "./functions/filepath-routing";
import { writeRoutesModule } from "./functions/routes";
import { pagesBetaWarning, RUNNING_BUILDERS } from "./utils";
import type { Config } from "./functions/routes";
import type { ArgumentsCamelCase, Argv } from "yargs";

type PagesBuildArgs = {
	directory: string;
	outfile: string;
	"output-config-path"?: string;
	minify: boolean;
	sourcemap: boolean;
	"fallback-service": string;
	watch: boolean;
	plugin: boolean;
	"build-output-directory"?: string;
	"node-compat": boolean;
};

export function Options(yargs: Argv): Argv<PagesBuildArgs> {
	return yargs
		.positional("directory", {
			type: "string",
			default: "functions",
			description: "The directory of Pages Functions",
		})
		.options({
			outfile: {
				type: "string",
				default: "_worker.js",
				description: "The location of the output Worker script",
			},
			"output-config-path": {
				type: "string",
				description: "The location for the output config file",
			},
			minify: {
				type: "boolean",
				default: false,
				description: "Minify the output Worker script",
			},
			sourcemap: {
				type: "boolean",
				default: false,
				description: "Generate a sourcemap for the output Worker script",
			},
			"fallback-service": {
				type: "string",
				default: "ASSETS",
				description:
					"The service to fallback to at the end of the `next` chain. Setting to '' will fallback to the global `fetch`.",
			},
			watch: {
				type: "boolean",
				default: false,
				description:
					"Watch for changes to the functions and automatically rebuild the Worker script",
			},
			plugin: {
				type: "boolean",
				default: false,
				description: "Build a plugin rather than a Worker script",
			},
			"build-output-directory": {
				type: "string",
				description: "The directory to output static assets to",
			},
			"node-compat": {
				describe: "Enable node.js compatibility",
				default: false,
				type: "boolean",
				hidden: true,
			},
		})
		.epilogue(pagesBetaWarning);
}

export const Handler = async ({
	directory,
	outfile,
	"output-config-path": outputConfigPath,
	minify,
	sourcemap,
	fallbackService,
	watch,
	plugin,
	"build-output-directory": buildOutputDirectory,
	"node-compat": nodeCompat,
}: ArgumentsCamelCase<PagesBuildArgs>) => {
	if (!isInPagesCI) {
		// Beta message for `wrangler pages <commands>` usage
		logger.log(pagesBetaWarning);
	}

	if (nodeCompat) {
		console.warn(
			"Enabling node.js compatibility mode for builtins and globals. This is experimental and has serious tradeoffs. Please see https://github.com/ionic-team/rollup-plugin-node-polyfills/ for more details."
		);
	}

	buildOutputDirectory ??= dirname(outfile);

	await buildFunctions({
		outfile,
		outputConfigPath,
		functionsDirectory: directory,
		minify,
		sourcemap,
		fallbackService,
		watch,
		plugin,
		buildOutputDirectory,
		nodeCompat,
	});
	metrics.sendMetricsEvent("build pages functions");
};

export async function buildFunctions({
	outfile,
	outputConfigPath,
	functionsDirectory,
	minify = false,
	sourcemap = false,
	fallbackService = "ASSETS",
	watch = false,
	onEnd,
	plugin = false,
	buildOutputDirectory,
	nodeCompat,
}: {
	outfile: string;
	outputConfigPath?: string;
	functionsDirectory: string;
	minify?: boolean;
	sourcemap?: boolean;
	fallbackService?: string;
	watch?: boolean;
	onEnd?: () => void;
	plugin?: boolean;
	buildOutputDirectory?: string;
	nodeCompat?: boolean;
}) {
	RUNNING_BUILDERS.forEach(
		(runningBuilder) => runningBuilder.stop && runningBuilder.stop()
	);

	const routesModule = join(tmpdir(), `./functionsRoutes-${Math.random()}.mjs`);
	const baseURL = toUrlPath("/");

	const config: Config = await generateConfigFromFileTree({
		baseDir: functionsDirectory,
		baseURL,
	});

	if (outputConfigPath) {
		writeFileSync(
			outputConfigPath,
			JSON.stringify({ ...config, baseURL }, null, 2)
		);
	}

	await writeRoutesModule({
		config,
		srcDir: functionsDirectory,
		outfile: routesModule,
	});

	if (plugin) {
		RUNNING_BUILDERS.push(
			await buildPlugin({
				routesModule,
				outfile,
				minify,
				sourcemap,
				watch,
				nodeCompat,
				onEnd,
			})
		);
	} else {
		RUNNING_BUILDERS.push(
			await buildWorker({
				routesModule,
				outfile,
				minify,
				sourcemap,
				fallbackService,
				watch,
				onEnd,
				buildOutputDirectory,
				nodeCompat,
			})
		);
	}
}
