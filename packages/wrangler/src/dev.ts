import assert from "node:assert";
import events from "node:events";
import {
	configFileName,
	formatConfigSnippet,
	UserError,
} from "@cloudflare/workers-utils";
import { isWebContainer } from "@webcontainer/env";
import { convertConfigToBindings } from "./api/startDevWorker/utils";
import { getAssetsOptions } from "./assets";
import { createCommand } from "./core/create-command";
import { validateRoutes } from "./deploy/deploy";
import { getVarsForDev } from "./dev/dev-vars";
import { startDev } from "./dev/start-dev";
import { logger } from "./logger";
import { getHostFromRoute } from "./zones";
import type { StartDevWorkerInput, Trigger } from "./api";
import type { EnablePagesAssetsServiceBindingOptions } from "./miniflare-cli/types";
import type {
	Binding,
	CfModule,
	Config,
	Environment,
	Route,
	Rule,
} from "@cloudflare/workers-utils";
import type { EventName } from "chokidar/handler.js";
import type { Json } from "miniflare";

export const dev = createCommand({
	behaviour: {
		provideConfig: false,
		overrideExperimentalFlags: (args) => ({
			MULTIWORKER: Array.isArray(args.config),
			RESOURCES_PROVISION: args.experimentalProvision ?? false,
			AUTOCREATE_RESOURCES: args.experimentalAutoCreate,
		}),
		printMetricsBanner: true,
	},
	metadata: {
		description: "👂 Start a local server for developing your Worker",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		category: "Compute & AI",
	},
	positionalArgs: ["script"],
	args: {
		script: {
			describe: "The path to an entry point for your Worker",
			type: "string",
		},
		name: {
			describe: "Name of the Worker",
			type: "string",
			requiresArg: true,
		},
		"compatibility-date": {
			describe: "Date to use for compatibility checks",
			type: "string",
			requiresArg: true,
		},
		"compatibility-flags": {
			describe: "Flags to use for compatibility checks",
			alias: "compatibility-flag",
			type: "string",
			requiresArg: true,
			array: true,
		},
		latest: {
			describe: "Use the latest version of the Workers runtime",
			type: "boolean",
			default: true,
		},
		assets: {
			describe: "Static assets to be served. Replaces Workers Sites.",
			type: "string",
			requiresArg: true,
		},
		// We want to have a --no-bundle flag, but yargs requires that
		// we also have a --bundle flag (that it adds the --no to by itself)
		// So we make a --bundle flag, but hide it, and then add a --no-bundle flag
		// that's visible to the user but doesn't "do" anything.
		bundle: {
			describe: "Run wrangler's compilation step before publishing",
			type: "boolean",
			hidden: true,
		},
		"no-bundle": {
			describe: "Skip internal build steps and directly deploy script",
			type: "boolean",
			default: false,
		},
		ip: {
			describe: "IP address to listen on",
			type: "string",
		},
		port: {
			describe: "Port to listen on",
			type: "number",
		},
		"inspector-port": {
			describe: "Port for devtools to connect to",
			type: "number",
		},
		"inspector-ip": {
			describe: "IP address for devtools to connect to",
			type: "string",
		},
		routes: {
			describe: "Routes to upload",
			alias: "route",
			type: "string",
			requiresArg: true,
			array: true,
		},
		host: {
			type: "string",
			requiresArg: true,
			describe: "Host to forward requests to, defaults to the zone of project",
		},
		"local-protocol": {
			describe: "Protocol to listen to requests on, defaults to http.",
			choices: ["http", "https"] as const,
		},
		"https-key-path": {
			describe: "Path to a custom certificate key",
			type: "string",
			requiresArg: true,
		},
		"https-cert-path": {
			describe: "Path to a custom certificate",
			type: "string",
			requiresArg: true,
		},
		"local-upstream": {
			type: "string",
			describe:
				"Host to act as origin in local mode, defaults to dev.host or route",
		},
		"enable-containers": {
			type: "boolean",
			describe: "Whether to build and enable containers during development",
			hidden: true,
		},
		site: {
			describe: "Root folder of static assets for Workers Sites",
			type: "string",
			requiresArg: true,
			hidden: true,
			deprecated: true,
		},
		"site-include": {
			describe:
				"Array of .gitignore-style patterns that match file or directory names from the sites directory. Only matched items will be uploaded.",
			type: "string",
			requiresArg: true,
			array: true,
			hidden: true,
			deprecated: true,
		},
		"site-exclude": {
			describe:
				"Array of .gitignore-style patterns that match file or directory names from the sites directory. Matched items will not be uploaded.",
			type: "string",
			requiresArg: true,
			array: true,
			hidden: true,
			deprecated: true,
		},
		"upstream-protocol": {
			describe: "Protocol to forward requests to host on, defaults to https.",
			choices: ["http", "https"] as const,
		},
		var: {
			describe: "A key-value pair to be injected into the script as a variable",
			type: "string",
			requiresArg: true,
			array: true,
		},
		define: {
			describe: "A key-value pair to be substituted in the script",
			type: "string",
			requiresArg: true,
			array: true,
		},
		alias: {
			describe: "A module pair to be substituted in the script",
			type: "string",
			requiresArg: true,
			array: true,
		},
		"jsx-factory": {
			describe: "The function that is called for each JSX element",
			type: "string",
			requiresArg: true,
		},
		"jsx-fragment": {
			describe: "The function that is called for each JSX fragment",
			type: "string",
			requiresArg: true,
		},
		tsconfig: {
			describe: "Path to a custom tsconfig.json file",
			type: "string",
			requiresArg: true,
		},
		remote: {
			alias: "r",
			describe:
				"Run on the global Cloudflare network with access to production resources",
			type: "boolean",
			default: false,
		},
		local: {
			alias: "l",
			describe: "Run locally with remote bindings disabled",
			type: "boolean",
		},
		minify: {
			describe: "Minify the script",
			type: "boolean",
		},
		"node-compat": {
			describe: "Enable Node.js compatibility",
			type: "boolean",
			hidden: true,
			deprecated: true,
		},
		"persist-to": {
			describe:
				"Specify directory to use for local persistence (defaults to .wrangler/state)",
			type: "string",
			requiresArg: true,
		},
		"live-reload": {
			describe: "Auto reload HTML pages when change is detected in local mode",
			type: "boolean",
		},
		"legacy-env": {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
		},
		"test-scheduled": {
			describe: "Test scheduled events by visiting /__scheduled in browser",
			type: "boolean",
			default: false,
		},
		"log-level": {
			choices: ["debug", "info", "log", "warn", "error", "none"] as const,
			describe: "Specify logging level",
		},
		"show-interactive-dev-session": {
			describe:
				"Show interactive dev session (defaults to true if the terminal supports interactivity)",
			type: "boolean",
		},
		"experimental-tail-logs": {
			type: "boolean",
			alias: ["x-tail-logs"],
			describe:
				"Experimental: Get runtime logs for the remote worker via Workers Tails rather than the Devtools inspector",
			default: true,
			hidden: true,
		},
		types: {
			describe: "Generate types from your Worker configuration",
			type: "boolean",
		},
	},
	async validateArgs(args) {
		if (args.nodeCompat) {
			throw new UserError(
				`The --node-compat flag is no longer supported as of Wrangler v4. Instead, use the \`nodejs_compat\` compatibility flag. This includes the functionality from legacy \`node_compat\` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.`
			);
		}
		if (args.liveReload && args.remote) {
			throw new UserError(
				"--live-reload is only supported in local mode. Please just use one of either --remote or --live-reload."
			);
		}

		if (isWebContainer()) {
			logger.error(
				`Oh no! 😟 You tried to run \`wrangler dev\` in a StackBlitz WebContainer. 🤯
	This is currently not supported 😭, but we think that we'll get it to work soon... hang in there! 🥺`
			);
			process.exitCode = 1;
			return;
		}
	},
	async handler(args) {
		const devInstance = await startDev(args);
		assert(devInstance.devEnv !== undefined);
		await events.once(devInstance.devEnv, "teardown");
		await Promise.all(devInstance.secondary.map((d) => d.teardown()));
		if (devInstance.teardownRegistryPromise) {
			const teardownRegistry = await devInstance.teardownRegistryPromise;
			await teardownRegistry(devInstance.devEnv.config.latestConfig?.name);
		}
		devInstance.unregisterHotKeys?.();
	},
});

export type AdditionalDevProps = {
	/**
	 * Default vars that can be overridden by config vars.
	 * Useful for injecting environment-specific defaults like CF_PAGES variables.
	 */
	defaultBindings?: Record<string, Extract<Binding, { type: "plain_text" }>>;
	vars?: Record<string, string | Json>;
	kv?: {
		binding: string;
		id?: string;
		preview_id?: string;
	}[];
	durableObjects?: {
		name: string;
		class_name: string;
		script_name?: string | undefined;
		environment?: string | undefined;
	}[];
	services?: {
		binding: string;
		service: string;
		environment?: string;
		entrypoint?: string;
	}[];
	r2?: {
		binding: string;
		bucket_name?: string;
		preview_bucket_name?: string;
		jurisdiction?: string;
	}[];
	ai?: {
		binding: string;
	};
	version_metadata?: {
		binding: string;
	};
	d1Databases?: Array<
		Omit<Environment["d1_databases"][number], "database_id"> & {
			database_id?: string;
		}
	>;
	processEntrypoint?: boolean;
	additionalModules?: CfModule[];
	moduleRoot?: string;
	rules?: Rule[];
	showInteractiveDevSession?: boolean;
};

type DevArguments = (typeof dev)["args"];

export type StartDevOptions = DevArguments &
	// These options can be passed in directly when called with the `wrangler.dev()` API.
	// They aren't exposed as CLI arguments.
	AdditionalDevProps & {
		forceLocal?: boolean;
		accountId?: string;
		disableDevRegistry?: boolean;
		enablePagesAssetsServiceBinding?: EnablePagesAssetsServiceBindingOptions;
		onReady?: (ip: string, port: number) => void;
		enableIpc?: boolean;
		dockerPath?: string;
		containerEngine?: string;
	};

export async function getHostAndRoutes(
	args:
		| Pick<StartDevOptions, "host" | "routes" | "assets">
		| {
				host?: string;
				routes?: Extract<Trigger, { type: "route" }>[];
				assets?: string;
		  },
	config: Config
) {
	// TODO: if worker_dev = false and no routes, then error (only for dev)
	// Compute zone info from the `host` and `route` args and config;
	const host = args.host || config.dev.host;
	const routes: Route[] | undefined = (
		args.routes ||
		(config.route && [config.route]) ||
		config.routes
	)?.map((r) => {
		if (typeof r !== "object") {
			return r;
		}
		if ("custom_domain" in r || "zone_id" in r || "zone_name" in r) {
			return r;
		} else {
			// Make sure we map SDW SimpleRoute types { type: "route", pattern: string } to string
			return r.pattern;
		}
	});
	if (routes) {
		const assetOptions = getAssetsOptions({ assets: args.assets }, config);
		validateRoutes(routes, assetOptions);
	}
	return { host, routes };
}

export function getInferredHost(
	routes: Route[] | undefined,
	configPath: string | undefined
) {
	if (routes?.length) {
		const firstRoute = routes[0];
		const host = getHostFromRoute(firstRoute);

		// TODO(consider): do we need really need to do this? I've added the condition to throw to match the previous implicit behaviour of `new URL()` throwing upon invalid URLs, but could we just continue here without an inferred host?
		if (host === undefined) {
			throw new UserError(
				`Cannot infer host from first route: ${JSON.stringify(
					firstRoute
				)}.\nYou can explicitly set the \`dev.host\` configuration in your ${configFileName(configPath)} file, for example:

	\`\`\`
	${formatConfigSnippet(
		{
			dev: {
				host: "example.com",
			},
		},
		configPath
	)}
	\`\`\`
`
			);
		}
		return host;
	}
}

/**
 * Apply Hyperdrive connection string environment variables to config.
 * Checks for CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_* env vars
 * and applies them to the config's hyperdrive bindings.
 */
function applyHyperdriveEnvVars(config: Config, local: boolean): void {
	for (const hyperdrive of config.hyperdrive ?? []) {
		const prefix = `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_`;
		const deprecatedPrefix = `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_`;

		let varName = `${prefix}${hyperdrive.binding}`;
		let connectionStringFromEnv = process.env[varName];

		if (!connectionStringFromEnv) {
			varName = `${deprecatedPrefix}${hyperdrive.binding}`;
			connectionStringFromEnv = process.env[varName];
		}

		// only require a local connection string in the wrangler file or the env if not using dev --remote
		if (
			local &&
			connectionStringFromEnv === undefined &&
			hyperdrive.localConnectionString === undefined
		) {
			throw new UserError(
				`When developing locally, you should use a local Postgres connection string to emulate Hyperdrive functionality. Please setup Postgres locally and set the value of the '${prefix}${hyperdrive.binding}' variable or "${hyperdrive.binding}"'s "localConnectionString" to the Postgres connection string.`,
				{ telemetryMessage: "no local hyperdrive connection string" }
			);
		}

		// If there is a non-empty connection string specified in the environment,
		// use that as our local connection string configuration.
		if (connectionStringFromEnv) {
			if (varName.startsWith(deprecatedPrefix)) {
				logger.once.warn(
					`Using "${deprecatedPrefix}<BINDING_NAME>" environment variable. This is deprecated. Please use "${prefix}<BINDING_NAME>" instead.`
				);
			}
			logger.log(
				`Found a non-empty ${varName} variable for binding. Hyperdrive will connect to this database during local development.`
			);
			hyperdrive.localConnectionString = connectionStringFromEnv;
		}
	}
}
/**
 * Gets the bindings for the Cloudflare Worker.
 *
 * @param configParam The loaded configuration.
 * @param env The environment to use, if any.
 * @param envFiles An array of paths, relative to the project directory, of .env files to load.
 * If `undefined` it defaults to the standard .env files from `getDefaultEnvFiles()`.
 * @param local Whether the dev server should run locally.
 * @param inputBindings Additional bindings to merge on top of config bindings
 * @returns The bindings for the Cloudflare Worker.
 */
export function getBindings(
	configParam: Config,
	env: string | undefined,
	envFiles: string[] | undefined,
	local: boolean,
	inputBindings: StartDevWorkerInput["bindings"],
	defaultBindings: StartDevWorkerInput["bindings"]
): StartDevWorkerInput["bindings"] {
	applyHyperdriveEnvVars(configParam, local);

	const bindings = convertConfigToBindings(configParam, {
		usePreviewIds: true,
	});

	// Override vars with .dev.vars (dev-specific)
	// getVarsForDev returns typed bindings: config vars are plain_text/json,
	// while .dev.vars/.env vars are secret_text
	const vars = getVarsForDev(
		configParam.userConfigPath,
		envFiles,
		configParam.vars,
		env
	);
	for (const [name, binding] of Object.entries(vars)) {
		// Only override plain_text/json/secret_text vars, not other binding types like kv_namespace
		const existingBinding = bindings[name];
		if (
			!existingBinding ||
			existingBinding.type === "plain_text" ||
			existingBinding.type === "json" ||
			existingBinding.type === "secret_text"
		) {
			bindings[name] = binding;
		}
	}

	return { ...defaultBindings, ...bindings, ...inputBindings };
}

export function getAssetChangeMessage(
	eventName: EventName,
	assetPath: string
): string {
	let message = `${assetPath} changed`;
	switch (eventName) {
		case "add":
			message = `File ${assetPath} was added`;
			break;
		case "addDir":
			message = `Directory ${assetPath} was added`;
			break;
		case "unlink":
			message = `File ${assetPath} was removed`;
			break;
		case "unlinkDir":
			message = `Directory ${assetPath} was removed`;
			break;
	}

	return message;
}
