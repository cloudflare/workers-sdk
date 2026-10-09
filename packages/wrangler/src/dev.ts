import assert from "node:assert";
import events from "node:events";
import {
	configFileName,
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
import { startDev } from "./dev/start-dev";
import isNonInteractiveTurborepo from "./is-non-interactive-turborepo";
import { logger } from "./logger";
import { detectAgent } from "./utils/detect-agent";
import type { Trigger } from "./api/startDevWorker/types";
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

export { getBindings } from "@cloudflare/deploy-helpers/miniflare-options";

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
