import assert from "node:assert";
import events from "node:events";
import {
	configFileName,
	convertConfigToBindings,
	formatConfigSnippet,
	getLocalExplorerEnabledFromEnv,
	isInteractive,
	UserError,
} from "@cloudflare/workers-utils";
import { getHostFromRoute } from "@cloudflare/workers-utils";
import { isWebContainer } from "@webcontainer/env";
import { getAssetsOptions } from "./assets";
import { createCommand } from "./core/create-command";
import { validateRoutes } from "./deployment-bundle/resolve-config-args";
import { devArgs, validateDevArgs } from "./dev/args";
import { getVarsForDev } from "./dev/dev-vars";
import { startDev } from "./dev/start-dev";
import isNonInteractiveTurborepo from "./is-non-interactive-turborepo";
import { logger } from "./logger";
import { detectAgent } from "./utils/detect-agent";
import type { StartDevWorkerInput, Trigger } from "./api/startDevWorker/types";
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
	args: devArgs,
	async validateArgs(args) {
		validateDevArgs(args);

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
		const interactiveDevSession =
			isInteractive() &&
			!isNonInteractiveTurborepo() &&
			args.showInteractiveDevSession !== false;
		const showLocalExplorerAgentHint =
			!interactiveDevSession &&
			!args.remote &&
			getLocalExplorerEnabledFromEnv() &&
			detectAgent().isAgent;
		const devInstance = await startDev({
			...args,
			showLocalExplorerAgentHint,
		});
		assert(devInstance.devEnv !== undefined);
		await events.once(devInstance.devEnv, "teardown");
		await Promise.all(devInstance.secondary.map((d) => d.teardown()));

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
	stream?: {
		binding: string;
		remote?: boolean;
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
	showLocalExplorerAgentHint?: boolean;
};

type DevArguments = Omit<(typeof dev)["args"], "installSkills" | "profile">;

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
		/** Set to `false` to disable persistence. When `true` or `undefined`, uses default persistence path. */
		persist?: boolean;
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
		const assetOptions = getAssetsOptions({
			args: {
				assets: args.assets,
			},
			config,
		});
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
`,
				{ telemetryMessage: "dev command host inference failed" }
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

		// only require a local connection string in the wrangler file or the env
		// if not using dev --remote, and not opted into a remote Hyperdrive
		// binding (which tunnels to the edge instead of a local database)
		if (
			local &&
			!hyperdrive.remote &&
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

	// createTestHarness() can override secrets through inputBindings.
	// This filters out those required secrets so the logic doesn't consider them missing
	const secrets = configParam.secrets
		? {
				...configParam.secrets,
				required: configParam.secrets?.required?.filter(
					(secret) => inputBindings?.[secret]?.type !== "secret_text"
				),
			}
		: undefined;
	// Override vars with .dev.vars (dev-specific)
	// getVarsForDev returns typed bindings: config vars are plain_text/json,
	// while .dev.vars/.env vars are secret_text.
	// When secrets is defined, only declared secret keys are loaded from files.
	const vars = getVarsForDev(
		configParam.userConfigPath,
		envFiles,
		configParam.vars,
		env,
		false,
		secrets
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
