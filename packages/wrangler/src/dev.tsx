import path from "node:path";
import { isWebContainer } from "@webcontainer/env";
import { watch } from "chokidar";
import getPort from "get-port";
import { render } from "ink";
import React from "react";
import { findWranglerToml, printBindings, readConfig } from "./config";
import { getEntry } from "./deployment-bundle/entry";
import Dev from "./dev/dev";
import { getVarsForDev } from "./dev/dev-vars";
import { getLocalPersistencePath } from "./dev/get-local-persistence-path";
import { startDevServer } from "./dev/start-server";
import { UserError } from "./errors";
import { logger } from "./logger";
import * as metrics from "./metrics";
import { getAssetPaths, getSiteAssetPaths } from "./sites";
import { getAccountFromCache, loginOrRefreshIfRequired } from "./user";
import { collectKeyValues } from "./utils/collectKeyValues";
import { mergeWithOverride } from "./utils/mergeWithOverride";
import { getHostFromRoute, getZoneIdForPreview } from "./zones";
import {
	DEFAULT_INSPECTOR_PORT,
	DEFAULT_LOCAL_PORT,
	getDevCompatibilityDate,
	getRules,
	getScriptName,
	isLegacyEnv,
	printWranglerBanner,
} from "./index";
import type { ProxyData } from "./api";
import type { Config, Environment } from "./config";
import type {
	EnvironmentNonInheritable,
	Route,
	Rule,
} from "./config/environment";
import type { CfModule, CfWorkerInit } from "./deployment-bundle/worker";
import type { LoggerLevel } from "./logger";
import type { EnablePagesAssetsServiceBindingOptions } from "./miniflare-cli/types";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "./yargs-types";
import type { Json } from "miniflare";

export function devOptions(yargs: CommonYargsArgv) {
	return (
		yargs
			.positional("script", {
				describe: "The path to an entry point for your worker",
				type: "string",
			})
			.option("name", {
				describe: "Name of the worker",
				type: "string",
				requiresArg: true,
			})
			// We want to have a --no-bundle flag, but yargs requires that
			// we also have a --bundle flag (that it adds the --no to by itself)
			// So we make a --bundle flag, but hide it, and then add a --no-bundle flag
			// that's visible to the user but doesn't "do" anything.
			.option("bundle", {
				describe: "Run wrangler's compilation step before publishing",
				type: "boolean",
				hidden: true,
			})
			.option("no-bundle", {
				describe: "Skip internal build steps and directly deploy script",
				type: "boolean",
				default: false,
			})
			.option("format", {
				choices: ["modules", "service-worker"] as const,
				describe: "Choose an entry type",
				hidden: true,
				deprecated: true,
			})
			.option("compatibility-date", {
				describe: "Date to use for compatibility checks",
				type: "string",
				requiresArg: true,
			})
			.option("compatibility-flags", {
				describe: "Flags to use for compatibility checks",
				alias: "compatibility-flag",
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("latest", {
				describe: "Use the latest version of the worker runtime",
				type: "boolean",
				default: true,
			})
			.option("dispatch-namespace", {
				describe: "Name of the Workers for Platforms dispatch namespace",
				type: "string",
			})
			.option("ip", {
				describe: "IP address to listen on",
				type: "string",
			})
			.option("port", {
				describe: "Port to listen on",
				type: "number",
			})
			.option("inspector-port", {
				describe: "Port for devtools to connect to",
				type: "number",
			})
			.option("routes", {
				describe: "Routes to upload",
				alias: "route",
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("host", {
				type: "string",
				requiresArg: true,
				describe:
					"Host to forward requests to, defaults to the zone of project",
			})
			.option("local-protocol", {
				describe: "Protocol to listen to requests on, defaults to http.",
				choices: ["http", "https"] as const,
			})
			.option("https-key-path", {
				describe: "Path to a custom certificate key",
				type: "string",
				requiresArg: true,
			})
			.option("https-cert-path", {
				describe: "Path to a custom certificate",
				type: "string",
				requiresArg: true,
			})
			.options("local-upstream", {
				type: "string",
				describe:
					"Host to act as origin in local mode, defaults to dev.host or route",
			})
			.option("experimental-public", {
				describe: "Static assets to be served",
				type: "string",
				requiresArg: true,
				deprecated: true,
				hidden: true,
			})
			.option("assets", {
				describe: "Static assets to be served",
				type: "string",
				requiresArg: true,
			})
			.option("public", {
				describe: "(Deprecated) Static assets to be served",
				type: "string",
				requiresArg: true,
				deprecated: true,
				hidden: true,
			})
			.option("site", {
				describe: "Root folder of static assets for Workers Sites",
				type: "string",
				requiresArg: true,
			})
			.option("site-include", {
				describe:
					"Array of .gitignore-style patterns that match file or directory names from the sites directory. Only matched items will be uploaded.",
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("site-exclude", {
				describe:
					"Array of .gitignore-style patterns that match file or directory names from the sites directory. Matched items will not be uploaded.",
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("upstream-protocol", {
				describe: "Protocol to forward requests to host on, defaults to https.",
				choices: ["http", "https"] as const,
			})
			.option("var", {
				describe:
					"A key-value pair to be injected into the script as a variable",
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("define", {
				describe: "A key-value pair to be substituted in the script",
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("jsx-factory", {
				describe: "The function that is called for each JSX element",
				type: "string",
				requiresArg: true,
			})
			.option("jsx-fragment", {
				describe: "The function that is called for each JSX fragment",
				type: "string",
				requiresArg: true,
			})
			.option("tsconfig", {
				describe: "Path to a custom tsconfig.json file",
				type: "string",
				requiresArg: true,
			})
			.option("remote", {
				alias: "r",
				describe:
					"Run on the global Cloudflare network with access to production resources",
				type: "boolean",
				default: false,
			})
			.option("local", {
				alias: "l",
				describe: "Run on my machine",
				type: "boolean",
				deprecated: true,
				hidden: true,
			})
			.option("experimental-local", {
				describe: "Run on my machine using the Cloudflare Workers runtime",
				type: "boolean",
				deprecated: true,
				hidden: true,
			})
			.option("minify", {
				describe: "Minify the script",
				type: "boolean",
			})
			.option("node-compat", {
				describe: "Enable Node.js compatibility",
				type: "boolean",
			})
			.option("experimental-enable-local-persistence", {
				describe:
					"Enable persistence for local mode (deprecated, use --persist)",
				type: "boolean",
				deprecated: true,
				hidden: true,
			})
			.option("persist-to", {
				describe:
					"Specify directory to use for local persistence (defaults to .wrangler/state)",
				type: "string",
				requiresArg: true,
			})
			.option("live-reload", {
				describe:
					"Auto reload HTML pages when change is detected in local mode",
				type: "boolean",
			})
			.check((argv) => {
				if (argv["live-reload"] && argv.remote) {
					throw new UserError(
						"--live-reload is only supported in local mode. Please just use one of either --remote or --live-reload."
					);
				}
				return true;
			})
			.option("inspect", {
				describe: "Enable dev tools",
				type: "boolean",
				deprecated: true,
				hidden: true,
			})
			.option("legacy-env", {
				type: "boolean",
				describe: "Use legacy environments",
				hidden: true,
			})
			.option("test-scheduled", {
				describe: "Test scheduled events by visiting /__scheduled in browser",
				type: "boolean",
				default: false,
			})
			.option("log-level", {
				choices: ["debug", "info", "log", "warn", "error", "none"] as const,
				describe: "Specify logging level",
				// Yargs requires this to type log-level properly
				default: "log" as LoggerLevel,
			})
			.option("show-interactive-dev-session", {
				describe:
					"Show interactive dev session  (defaults to true if the terminal supports interactivity)",
				type: "boolean",
			})
	);
}

type DevArguments = StrictYargsOptionsToInterface<typeof devOptions>;

export async function devHandler(args: DevArguments) {
	if (isWebContainer()) {
		logger.error(
			`Oh no! 😟 You tried to run \`wrangler dev\` in a StackBlitz WebContainer. 🤯
This is currently not supported 😭, but we think that we'll get it to work soon... hang in there! 🥺`
		);
		process.exitCode = 1;
		return;
	}

	if (args.remote) {
		const isLoggedIn = await loginOrRefreshIfRequired();
		if (!isLoggedIn) {
			throw new UserError(
				"You must be logged in to use wrangler dev in remote mode. Try logging in, or run wrangler dev --local."
			);
		}
	}

	let watcher;
	try {
		const devInstance = await startDev(args);
		watcher = devInstance.watcher;
		const { waitUntilExit } = devInstance.devReactElement;
		await waitUntilExit();
	} finally {
		await watcher?.close();
	}
}

export type AdditionalDevProps = {
	vars?: Record<string, string | Json>;
	kv?: {
		binding: string;
		id: string;
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
		bucket_name: string;
		preview_bucket_name?: string;
		jurisdiction?: string;
	}[];
	ai?: {
		binding: string;
	};
	// why is this snake_case? :(
	version_metadata?: {
		binding: string;
	};
	dispatchNamespaces?: Environment["dispatch_namespaces"];
	d1Databases?: Environment["d1_databases"];
	processEntrypoint?: boolean;
	additionalModules?: CfModule[];
	moduleRoot?: string;
	rules?: Rule[];
	constellation?: Environment["constellation"];
	showInteractiveDevSession?: boolean;
};

export type StartDevOptions = DevArguments &
	// These options can be passed in directly when called with the `wrangler.dev()` API.
	// They aren't exposed as CLI arguments.
	AdditionalDevProps & {
		forceLocal?: boolean;
		accountId?: string;
		disableDevRegistry?: boolean;
		enablePagesAssetsServiceBinding?: EnablePagesAssetsServiceBindingOptions;
		onReady?: (ip: string, port: number, proxyData: ProxyData) => void;
		updateCheck?: boolean;
	};

export async function startDev(args: StartDevOptions) {
	let watcher: ReturnType<typeof watch> | undefined;
	let rerender: (node: React.ReactNode) => void | undefined;
	try {
		if (args.logLevel) {
			logger.loggerLevel = args.logLevel;
		}
		await printWranglerBanner(args.updateCheck);
		if (args.local) {
			logger.warn(
				"--local is no longer required and will be removed in a future version.\n`wrangler dev` now uses the local Cloudflare Workers runtime by default. 🎉"
			);
		}
		if (args.experimentalLocal) {
			logger.warn(
				"--experimental-local is no longer required and will be removed in a future version.\n`wrangler dev` now uses the local Cloudflare Workers runtime by default. 🎉"
			);
		}

		const configPath =
			args.config ||
			(args.script && findWranglerToml(path.dirname(args.script)));
		const projectRoot = configPath && path.dirname(configPath);
		let config = readConfig(configPath, args);

		if (config.configPath) {
			watcher = watch(config.configPath, {
				persistent: true,
			}).on("change", async (_event) => {
				// TODO: Do we need to handle different `_event` types differently?
				//       e.g. what if the file is deleted, or added?
				config = readConfig(configPath, args);
				if (config.configPath) {
					logger.log(`${path.basename(config.configPath)} changed...`);
					rerender(await getDevReactElement(config));
				}
			});
		}

		const {
			entry,
			legacyNodeCompat,
			nodejsCompat,
			upstreamProtocol,
			host,
			routes,
			getLocalPort,
			getInspectorPort,
			getRuntimeInspectorPort,
			cliDefines,
			localPersistencePath,
			processEntrypoint,
			additionalModules,
		} = await validateDevServerSettings(args, config);

		await metrics.sendMetricsEvent(
			"run dev",
			{
				local: !args.remote,
				usesTypeScript: /\.tsx?$/.test(entry.file),
			},
			{ sendMetrics: config.send_metrics, offline: !args.remote }
		);

		// eslint-disable-next-line no-inner-declarations
		async function getDevReactElement(configParam: Config) {
			const { assetPaths, bindings } = getBindingsAndAssetPaths(
				args,
				configParam
			);

			return (
				<Dev
					name={getScriptName({ name: args.name, env: args.env }, configParam)}
					noBundle={!(args.bundle ?? !configParam.no_bundle)}
					findAdditionalModules={configParam.find_additional_modules}
					entry={entry}
					env={args.env}
					host={host}
					routes={routes}
					processEntrypoint={processEntrypoint}
					additionalModules={additionalModules}
					rules={args.rules ?? getRules(configParam)}
					legacyEnv={isLegacyEnv(configParam)}
					minify={args.minify ?? configParam.minify}
					legacyNodeCompat={legacyNodeCompat}
					nodejsCompat={nodejsCompat}
					build={configParam.build || {}}
					define={{ ...configParam.define, ...cliDefines }}
					initialMode={args.remote ? "remote" : "local"}
					jsxFactory={args.jsxFactory || configParam.jsx_factory}
					jsxFragment={args.jsxFragment || configParam.jsx_fragment}
					tsconfig={args.tsconfig ?? configParam.tsconfig}
					upstreamProtocol={upstreamProtocol}
					localProtocol={args.localProtocol || configParam.dev.local_protocol}
					httpsKeyPath={args.httpsKeyPath}
					httpsCertPath={args.httpsCertPath}
					localUpstream={args.localUpstream ?? host ?? getInferredHost(routes)}
					localPersistencePath={localPersistencePath}
					liveReload={args.liveReload || false}
					accountId={
						args.accountId ??
						configParam.account_id ??
						getAccountFromCache()?.id
					}
					assetPaths={assetPaths}
					assetsConfig={configParam.assets}
					initialPort={
						args.port ?? configParam.dev.port ?? (await getLocalPort())
					}
					initialIp={args.ip || configParam.dev.ip}
					inspectorPort={
						args.inspectorPort ??
						configParam.dev.inspector_port ??
						(await getInspectorPort())
					}
					runtimeInspectorPort={await getRuntimeInspectorPort()}
					isWorkersSite={Boolean(args.site || configParam.site)}
					compatibilityDate={getDevCompatibilityDate(
						configParam,
						args.compatibilityDate
					)}
					compatibilityFlags={
						args.compatibilityFlags || configParam.compatibility_flags
					}
					dispatchNamespace={
						args.dispatchNamespace || configParam.dispatch_namespace
					}
					usageModel={configParam.usage_model}
					bindings={bindings}
					crons={configParam.triggers.crons}
					queueConsumers={configParam.queues.consumers}
					onReady={args.onReady}
					inspect={args.inspect ?? true}
					showInteractiveDevSession={args.showInteractiveDevSession}
					forceLocal={args.forceLocal || !!args.dispatchNamespace}
					enablePagesAssetsServiceBinding={args.enablePagesAssetsServiceBinding}
					firstPartyWorker={configParam.first_party_worker}
					sendMetrics={configParam.send_metrics}
					testScheduled={args.testScheduled}
					projectRoot={projectRoot}
				/>
			);
		}
		const devReactElement = render(await getDevReactElement(config));

		rerender = devReactElement.rerender;
		return {
			devReactElement,
			watcher,
			stop: async () => {
				devReactElement.unmount();
				await watcher?.close();
			},
		};
	} catch (e) {
		await watcher?.close();
		throw e;
	}
}

export async function startApiDev(args: StartDevOptions) {
	if (args.logLevel) {
		logger.loggerLevel = args.logLevel;
	}
	await printWranglerBanner(args.updateCheck);

	const configPath =
		args.config || (args.script && findWranglerToml(path.dirname(args.script)));
	const projectRoot = configPath && path.dirname(configPath);
	const config = readConfig(configPath, args);

	const {
		entry,
		legacyNodeCompat,
		nodejsCompat,
		upstreamProtocol,
		host,
		routes,
		getLocalPort,
		getInspectorPort,
		getRuntimeInspectorPort,
		cliDefines,
		localPersistencePath,
		processEntrypoint,
		additionalModules,
	} = await validateDevServerSettings(args, config);

	await metrics.sendMetricsEvent(
		"run dev (api)",
		{ local: !args.remote },
		{ sendMetrics: config.send_metrics, offline: !args.remote }
	);

	// eslint-disable-next-line no-inner-declarations
	async function getDevServer(configParam: Config) {
		const { assetPaths, bindings } = getBindingsAndAssetPaths(
			args,
			configParam
		);

		//if args.bundle is on, don't disable bundling
		//if there's no args.bundle, and configParam.no_bundle is on, disable bundling
		//otherwise, enable bundling
		const enableBundling = args.bundle ?? !configParam.no_bundle;
		return await startDevServer({
			name: getScriptName({ name: args.name, env: args.env }, configParam),
			noBundle: !enableBundling,
			findAdditionalModules: configParam.find_additional_modules,
			entry: entry,
			env: args.env,
			host: host,
			routes: routes,
			processEntrypoint,
			additionalModules,
			rules: args.rules ?? getRules(configParam),
			legacyEnv: isLegacyEnv(configParam),
			minify: args.minify ?? configParam.minify,
			legacyNodeCompat,
			nodejsCompat,
			build: configParam.build || {},
			define: { ...config.define, ...cliDefines },
			initialMode: args.remote ? "remote" : "local",
			jsxFactory: args.jsxFactory ?? configParam.jsx_factory,
			jsxFragment: args.jsxFragment ?? configParam.jsx_fragment,
			tsconfig: args.tsconfig ?? configParam.tsconfig,
			upstreamProtocol: upstreamProtocol,
			localProtocol: args.localProtocol ?? configParam.dev.local_protocol,
			httpsKeyPath: args.httpsKeyPath,
			httpsCertPath: args.httpsCertPath,
			localUpstream: args.localUpstream ?? host ?? getInferredHost(routes),
			localPersistencePath,
			liveReload: args.liveReload ?? false,
			accountId:
				args.accountId ?? configParam.account_id ?? getAccountFromCache()?.id,
			assetPaths: assetPaths,
			assetsConfig: configParam.assets,
			//port can be 0, which means to use a random port
			initialPort: args.port ?? configParam.dev.port ?? (await getLocalPort()),
			initialIp: args.ip ?? configParam.dev.ip,
			inspectorPort:
				args.inspectorPort ??
				configParam.dev.inspector_port ??
				(await getInspectorPort()),
			runtimeInspectorPort: await getRuntimeInspectorPort(),
			isWorkersSite: Boolean(args.site || configParam.site),
			compatibilityDate: getDevCompatibilityDate(
				config,
				// Only `compatibilityDate` will be set when using `unstable_dev`
				args.compatibilityDate
			),
			compatibilityFlags:
				args.compatibilityFlags ?? configParam.compatibility_flags,
			dispatchNamespace: args.dispatchNamespace,
			usageModel: configParam.usage_model,
			bindings: bindings,
			crons: configParam.triggers.crons,
			queueConsumers: configParam.queues.consumers,
			onReady: args.onReady,
			inspect: args.inspect ?? true,
			showInteractiveDevSession: args.showInteractiveDevSession,
			forceLocal: args.forceLocal || !!args.dispatchNamespace,
			enablePagesAssetsServiceBinding: args.enablePagesAssetsServiceBinding,
			local: !args.remote,
			firstPartyWorker: configParam.first_party_worker,
			sendMetrics: configParam.send_metrics,
			testScheduled: args.testScheduled,
			disableDevRegistry: args.disableDevRegistry ?? false,
			projectRoot,
		});
	}

	const devServer = await getDevServer(config);
	if (!devServer) {
		const error = new Error("Failed to start dev server.");
		logger.error(error.message);
		throw error;
	}

	return {
		stop: async () => {
			await devServer.stop();
		},
	};
}
/**
 * Get an available TCP port number.
 *
 * Avoiding calling `getPort()` multiple times by memoizing the first result.
 */
function memoizeGetPort(defaultPort: number, host: string) {
	let portValue: number;
	return async () => {
		// Check a specific host to avoid probing all local addresses.
		portValue = portValue ?? (await getPort({ port: defaultPort, host: host }));
		return portValue;
	};
}
/**
 * mask anything that was overridden in .dev.vars
 * so that we don't log potential secrets into the terminal
 */
function maskVars(bindings: CfWorkerInit["bindings"], configParam: Config) {
	const maskedVars = { ...bindings.vars };
	for (const key of Object.keys(maskedVars)) {
		if (maskedVars[key] !== configParam.vars[key]) {
			// This means it was overridden in .dev.vars
			// so let's mask it
			maskedVars[key] = "(hidden)";
		}
	}
	return maskedVars;
}

async function getHostAndRoutes(args: StartDevOptions, config: Config) {
	// TODO: if worker_dev = false and no routes, then error (only for dev)
	// Compute zone info from the `host` and `route` args and config;
	const host = args.host || config.dev.host;
	const routes: Route[] | undefined =
		args.routes || (config.route && [config.route]) || config.routes;

	return { host, routes };
}

export function getInferredHost(routes: Route[] | undefined) {
	if (routes) {
		const firstRoute = routes[0];
		const host = getHostFromRoute(firstRoute);

		// TODO(consider): do we need really need to do this? I've added the condition to throw to match the previous implicit behaviour of `new URL()` throwing upon invalid URLs, but could we just continue here without an inferred host?
		if (host === undefined) {
			throw new UserError(
				`Cannot infer host from first route: ${JSON.stringify(
					firstRoute
				)}.\nYou can explicitly set the \`dev.host\` configuration in your wrangler.toml file, for example:

	\`\`\`
	[dev]
	host = "example.com"
	\`\`\`
`
			);
		}
		return host;
	}
}

async function validateDevServerSettings(
	args: StartDevOptions,
	config: Config
) {
	const entry = await getEntry(
		{ assets: args.assets, script: args.script, moduleRoot: args.moduleRoot },
		config,
		"dev"
	);

	const { host, routes } = await getHostAndRoutes(args, config);

	// TODO: Remove this hack
	// This function throws if the zone ID can't be found given the provided host and routes
	// However, it's called as part of initialising a preview session, which is nested deep within
	// React/Ink and useEffect()s, which swallow the error and turn it into a logw. Because it's a non-recoverable user error,
	// we want it to exit the Wrangler process early to allow the user to fix it. Calling it here forces
	// the error to be thrown where it will correctly exit the Wrangler process
	if (args.remote) await getZoneIdForPreview(host, routes);
	const initialIp = args.ip || config.dev.ip;
	const initialIpListenCheck = initialIp === "*" ? "0.0.0.0" : initialIp;
	const getLocalPort = memoizeGetPort(DEFAULT_LOCAL_PORT, initialIpListenCheck);
	const getInspectorPort = memoizeGetPort(DEFAULT_INSPECTOR_PORT, "127.0.0.1");

	// Our inspector proxy server will be binding to the result of
	// `getInspectorPort`. If we attempted to bind workerd to the same inspector
	// port, we'd get a port already in use error. Therefore, generate a new port
	// for our runtime to bind its inspector service to.
	const getRuntimeInspectorPort = memoizeGetPort(0, "127.0.0.1");

	if (config.services && config.services.length > 0) {
		logger.warn(
			`This worker is bound to live services: ${config.services
				.map(
					(service) =>
						`${service.binding} (${service.service}${
							service.environment ? `@${service.environment}` : ""
						}${service.entrypoint ? `#${service.entrypoint}` : ""})`
				)
				.join(", ")}`
		);
	}

	if (args.inspect) {
		//devtools are enabled by default, but we still need to disable them if the caller doesn't want them
		logger.warn(
			"Passing --inspect is unnecessary, now you can always connect to devtools."
		);
	}
	if (args.experimentalPublic) {
		throw new UserError(
			"The --experimental-public field has been renamed to --assets"
		);
	}

	if (args.public) {
		throw new UserError("The --public field has been renamed to --assets");
	}

	if ((args.assets ?? config.assets) && (args.site ?? config.site)) {
		throw new UserError(
			"Cannot use Assets and Workers Sites in the same Worker."
		);
	}

	if (args.assets) {
		logger.warn(
			"The --assets argument is experimental and may change or break at any time"
		);
	}
	const upstreamProtocol =
		args.upstreamProtocol ?? config.dev.upstream_protocol;
	if (upstreamProtocol === "http" && args.remote) {
		logger.warn(
			"Setting upstream-protocol to http is not currently supported for remote mode.\n" +
				"If this is required in your project, please add your use case to the following issue:\n" +
				"https://github.com/cloudflare/workers-sdk/issues/583."
		);
	}
	const legacyNodeCompat = args.nodeCompat ?? config.node_compat;
	if (legacyNodeCompat) {
		logger.warn(
			"Enabling Node.js compatibility mode for built-ins and globals. This is experimental and has serious tradeoffs. Please see https://github.com/ionic-team/rollup-plugin-node-polyfills/ for more details."
		);
	}

	const compatibilityFlags =
		args.compatibilityFlags ?? config.compatibility_flags;
	const nodejsCompat = compatibilityFlags?.includes("nodejs_compat");
	if (legacyNodeCompat && nodejsCompat) {
		throw new UserError(
			"The `nodejs_compat` compatibility flag cannot be used in conjunction with the legacy `--node-compat` flag. If you want to use the Workers runtime Node.js compatibility features, please remove the `--node-compat` argument from your CLI command or `node_compat = true` from your config file."
		);
	}

	if (args.experimentalEnableLocalPersistence) {
		logger.warn(
			`--experimental-enable-local-persistence is deprecated.\n` +
				`Move any existing data to .wrangler/state and use --persist, or\n` +
				`use --persist-to=./wrangler-local-state to keep using the old path.`
		);
	}

	if (args.remote && args.dispatchNamespace) {
		throw new UserError(
			"The `--dispatch-namespace` argument cannot be used in conjunction with the `--remote` argument. If you want dispatch to this script from a Workers for Platforms dispatch namespace, please remove the `--remote` argument from your CLI command."
		);
	}

	if (args.remote && args.local) {
		throw new UserError(
			"The `--remote` argument cannot be used in conjunction with the `--local` argument."
		);
	}

	const localPersistencePath = getLocalPersistencePath(
		args.persistTo,
		config.configPath
	);

	const cliDefines = collectKeyValues(args.define);

	return {
		entry,
		upstreamProtocol,
		legacyNodeCompat,
		nodejsCompat,
		getLocalPort,
		getInspectorPort,
		getRuntimeInspectorPort,
		host,
		routes,
		cliDefines,
		localPersistencePath,
		processEntrypoint: !!args.processEntrypoint,
		additionalModules: args.additionalModules ?? [],
	};
}

function getBindingsAndAssetPaths(args: StartDevOptions, configParam: Config) {
	const cliVars = collectKeyValues(args.var);

	// now log all available bindings into the terminal
	const bindings = getBindings(configParam, args.env, !args.remote, {
		kv: args.kv,
		vars: { ...args.vars, ...cliVars },
		durableObjects: args.durableObjects,
		r2: args.r2,
		services: args.services,
		d1Databases: args.d1Databases,
		ai: args.ai,
		version_metadata: args.version_metadata,
		dispatchNamespaces: args.dispatchNamespaces,
	});

	const maskedVars = maskVars(bindings, configParam);

	printBindings({
		...bindings,
		vars: maskedVars,
	});

	const assetPaths =
		args.assets || configParam.assets
			? getAssetPaths(configParam, args.assets)
			: getSiteAssetPaths(
					configParam,
					args.site,
					args.siteInclude,
					args.siteExclude
			  );
	return { assetPaths, bindings };
}

export function getBindings(
	configParam: Config,
	env: string | undefined,
	local: boolean,
	args: AdditionalDevProps
): CfWorkerInit["bindings"] {
	/**
	 * In Pages, KV, DO, D1, R2, AI and service bindings can be specified as
	 * args to the `pages dev` command. These args will always take precedence
	 * over the configuration file, and therefore should override corresponding
	 * config in `wrangler.toml`.
	 */
	// merge KV bindings
	const kvConfig = (configParam.kv_namespaces || []).map(
		({ binding, preview_id, id }) => {
			// In remote `dev`, we make folks use a separate kv namespace called
			// `preview_id` instead of `id` so that they don't
			// break production data. So here we check that a `preview_id`
			// has actually been configured.
			// This whole block of code will be obsoleted in the future
			// when we have copy-on-write for previews on edge workers.
			if (!preview_id && !local) {
				// TODO: This error has to be a _lot_ better, ideally just asking
				// to create a preview namespace for the user automatically
				throw new UserError(
					`In development, you should use a separate kv namespace than the one you'd use in production. Please create a new kv namespace with "wrangler kv:namespace create <name> --preview" and add its id as preview_id to the kv_namespace "${binding}" in your wrangler.toml`
				); // Ugh, I really don't like this message very much
			}
			return {
				binding,
				id: preview_id ?? id,
			};
		}
	);
	const kvArgs = args.kv || [];
	const mergedKVBindings = mergeWithOverride(kvConfig, kvArgs, "binding");

	// merge DO bindings
	const doConfig = (configParam.durable_objects || { bindings: [] }).bindings;
	const doArgs = args.durableObjects || [];
	const mergedDOBindings = mergeWithOverride(doConfig, doArgs, "name");

	// merge D1 bindings
	const d1Config = (configParam.d1_databases ?? []).map((d1Db) => {
		const database_id = d1Db.preview_database_id
			? d1Db.preview_database_id
			: d1Db.database_id;

		if (local) {
			return { ...d1Db, database_id };
		}
		// if you have a preview_database_id, we'll use it, but we shouldn't force people to use it.
		if (!d1Db.preview_database_id && !process.env.NO_D1_WARNING) {
			logger.log(
				`--------------------\n💡 Recommendation: for development, use a preview D1 database rather than the one you'd use in production.\n💡 Create a new D1 database with "wrangler d1 create <name>" and add its id as preview_database_id to the d1_database "${d1Db.binding}" in your wrangler.toml\n--------------------\n`
			);
		}
		return { ...d1Db, database_id };
	});
	const d1Args = args.d1Databases || [];
	const mergedD1Bindings = mergeWithOverride(d1Config, d1Args, "binding");

	// merge R2 bindings
	const r2Config: EnvironmentNonInheritable["r2_buckets"] =
		configParam.r2_buckets?.map(
			({ binding, preview_bucket_name, bucket_name, jurisdiction }) => {
				// same idea as kv namespace preview id,
				// same copy-on-write TODO
				if (!preview_bucket_name && !local) {
					throw new UserError(
						`In development, you should use a separate r2 bucket than the one you'd use in production. Please create a new r2 bucket with "wrangler r2 bucket create <name>" and add its name as preview_bucket_name to the r2_buckets "${binding}" in your wrangler.toml`
					);
				}
				return {
					binding,
					bucket_name: preview_bucket_name ?? bucket_name,
					jurisdiction,
				};
			}
		) || [];
	const r2Args = args.r2 || [];
	const mergedR2Bindings = mergeWithOverride(r2Config, r2Args, "binding");

	// merge service bindings
	const servicesConfig = configParam.services || [];
	const servicesArgs = args.services || [];
	const mergedServiceBindings = mergeWithOverride(
		servicesConfig,
		servicesArgs,
		"binding"
	);

	// Hyperdrive bindings
	const hyperdriveBindings = configParam.hyperdrive.map((hyperdrive) => {
		const connectionStringFromEnv =
			process.env[
				`WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_${hyperdrive.binding}`
			];
		if (!connectionStringFromEnv && !hyperdrive.localConnectionString) {
			throw new UserError(
				`When developing locally, you should use a local Postgres connection string to emulate Hyperdrive functionality. Please setup Postgres locally and set the value of the 'WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_${hyperdrive.binding}' variable or "${hyperdrive.binding}"'s "localConnectionString" to the Postgres connection string.`
			);
		}

		// If there is a non-empty connection string specified in the environment,
		// use that as our local connection string configuration.
		if (connectionStringFromEnv) {
			logger.log(
				`Found a non-empty WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING variable for binding. Hyperdrive will connect to this database during local development.`
			);
			hyperdrive.localConnectionString = connectionStringFromEnv;
		}

		return hyperdrive;
	});

	// Queues bindings ??
	const queuesBindings = [
		...(configParam.queues.producers || []).map((queue) => {
			return { binding: queue.binding, queue_name: queue.queue };
		}),
	];

	// merge DO bindings
	const dispatchConfig = configParam.dispatch_namespaces || [];
	const dispatchArgs = args.dispatchNamespaces || [];
	const mergedDispatchBindings = mergeWithOverride(
		dispatchConfig,
		dispatchArgs,
		"binding"
	);

	const bindings = {
		// top-level fields
		wasm_modules: configParam.wasm_modules,
		text_blobs: configParam.text_blobs,
		data_blobs: configParam.data_blobs,

		// inheritable fields
		logfwdr: configParam.logfwdr,

		// non-inheritable fields
		vars: {
			// Use a copy of combinedVars since we're modifying it later
			...getVarsForDev(configParam, env),
			...args.vars,
		},
		durable_objects: {
			bindings: mergedDOBindings,
		},
		kv_namespaces: mergedKVBindings,
		queues: queuesBindings,
		r2_buckets: mergedR2Bindings,
		d1_databases: mergedD1Bindings,
		vectorize: configParam.vectorize,
		constellation: configParam.constellation,
		hyperdrive: hyperdriveBindings,
		services: mergedServiceBindings,
		analytics_engine_datasets: configParam.analytics_engine_datasets,
		browser: configParam.browser,
		ai: args.ai || configParam.ai,
		version_metadata: args.version_metadata || configParam.version_metadata,
		dispatch_namespaces: mergedDispatchBindings,
		unsafe: {
			bindings: configParam.unsafe.bindings,
			metadata: configParam.unsafe.metadata,
			capnp: configParam.unsafe.capnp,
		},
		mtls_certificates: configParam.mtls_certificates,
		send_email: configParam.send_email,
	};

	if (bindings.constellation && bindings.constellation.length > 0) {
		logger.warn(
			"`constellation` is deprecated and will be removed in the next major version.\nPlease migrate to Workers AI, learn more here https://developers.cloudflare.com/workers-ai/."
		);
	}

	return bindings;
}
