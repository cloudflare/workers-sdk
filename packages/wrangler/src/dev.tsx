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
import { logger } from "./logger";
import * as metrics from "./metrics";
import { getAssetPaths, getSiteAssetPaths } from "./sites";
import { getAccountFromCache, loginOrRefreshIfRequired } from "./user";
import { collectKeyValues } from "./utils/collectKeyValues";
import { getHostFromRoute, getZoneForRoute, getZoneIdFromHost } from "./zones";
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
import type { Route, Rule } from "./config/environment";
import type { CfWorkerInit, CfModule } from "./deployment-bundle/worker";
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
					throw new Error(
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
			throw new Error(
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
	}[];
	r2?: {
		binding: string;
		bucket_name: string;
		preview_bucket_name?: string;
		jurisdiction?: string;
	}[];
	d1Databases?: Environment["d1_databases"];
	processEntrypoint?: boolean;
	additionalModules?: CfModule[];
	moduleRoot?: string;
	rules?: Rule[];
	constellation?: Environment["constellation"];
};

export type StartDevOptions = DevArguments &
	// These options can be passed in directly when called with the `wrangler.dev()` API.
	// They aren't exposed as CLI arguments.
	AdditionalDevProps & {
		forceLocal?: boolean;
		disableDevRegistry?: boolean;
		enablePagesAssetsServiceBinding?: EnablePagesAssetsServiceBindingOptions;
		onReady?: (ip: string, port: number, proxyData: ProxyData) => void;
		showInteractiveDevSession?: boolean;
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
			zoneId,
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
					zone={zoneId}
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
					localUpstream={args.localUpstream ?? host}
					localPersistencePath={localPersistencePath}
					liveReload={args.liveReload || false}
					accountId={configParam.account_id || getAccountFromCache()?.id}
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
					usageModel={configParam.usage_model}
					bindings={bindings}
					crons={configParam.triggers.crons}
					queueConsumers={configParam.queues.consumers}
					onReady={args.onReady}
					inspect={args.inspect ?? true}
					showInteractiveDevSession={args.showInteractiveDevSession}
					forceLocal={args.forceLocal}
					enablePagesAssetsServiceBinding={args.enablePagesAssetsServiceBinding}
					firstPartyWorker={configParam.first_party_worker}
					sendMetrics={configParam.send_metrics}
					testScheduled={args.testScheduled}
					projectRoot={projectRoot}
				/>
			);
		}
		const devReactElement = render(await getDevReactElement(config));

		// In the bootstrapper script `bin/wrangler.js`, we open an IPC channel, so
		// IPC messages from this process are propagated through the bootstrapper.
		// Normally, Node's SIGINT handler would close this for us, but interactive
		// mode enables raw mode on stdin which disables the built-in handler. The
		// following line disconnects from the IPC channel when we press `x` or
		// CTRL-C in interactive mode, ensuring no open handles, and allowing for a
		// clean exit. Note, if we called `stop()` using the dev API, we don't want
		// to disconnect here, as the user may still need IPC. We also don't want
		// to disconnect if this file was imported in Jest (not the case with E2E
		// tests), as that would stop communication with the test runner.
		let apiStopped = false;
		void devReactElement.waitUntilExit().then(() => {
			if (!apiStopped && typeof jest === "undefined") process.disconnect?.();
		});

		rerender = devReactElement.rerender;
		return {
			devReactElement,
			watcher,
			stop: async () => {
				apiStopped = true;
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
		zoneId,
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
			zone: zoneId,
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
			localUpstream: args.localUpstream ?? host,
			localPersistencePath,
			liveReload: args.liveReload ?? false,
			accountId: configParam.account_id ?? getAccountFromCache()?.id,
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
			usageModel: configParam.usage_model,
			bindings: bindings,
			crons: configParam.triggers.crons,
			queueConsumers: configParam.queues.consumers,
			onReady: args.onReady,
			inspect: args.inspect ?? true,
			showInteractiveDevSession: args.showInteractiveDevSession,
			forceLocal: args.forceLocal,
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
		throw logger.error("Failed to start dev server.");
	}

	return {
		stop: async () => {
			await devServer.stop();
		},
	};
}
/**
 * Avoiding calling `getPort()` multiple times by memoizing the first result.
 */
function memoizeGetPort(defaultPort?: number) {
	let portValue: number;
	return async () => {
		return portValue || (portValue = await getPort({ port: defaultPort }));
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

async function getZoneIdHostAndRoutes(args: StartDevOptions, config: Config) {
	// TODO: if worker_dev = false and no routes, then error (only for dev)
	// Compute zone info from the `host` and `route` args and config;
	let host = args.host || config.dev.host;
	let zoneId: string | undefined;
	const routes: Route[] | undefined =
		args.routes || (config.route && [config.route]) || config.routes;

	if (args.remote) {
		if (host) {
			zoneId = await getZoneIdFromHost(host);
		}
		if (!zoneId && routes) {
			const firstRoute = routes[0];
			const zone = await getZoneForRoute(firstRoute);
			if (zone) {
				zoneId = zone.id;
				host = zone.host;
			}
		}
	} else if (!host) {
		if (routes) {
			const firstRoute = routes[0];
			host = getHostFromRoute(firstRoute);

			// TODO(consider): do we need really need to do this? I've added the condition to throw to match the previous implicit behaviour of `new URL()` throwing upon invalid URLs, but could we just continue here without an inferred host?
			if (host === undefined) {
				throw new Error(
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
		}
	}
	return { host, routes, zoneId };
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

	const { zoneId, host, routes } = await getZoneIdHostAndRoutes(args, config);
	const getLocalPort = memoizeGetPort(DEFAULT_LOCAL_PORT);
	const getInspectorPort = memoizeGetPort(DEFAULT_INSPECTOR_PORT);

	// Our inspector proxy server will be binding to the result of
	// `getInspectorPort`. If we attempted to bind workerd to the same inspector
	// port, we'd get a port already in use error. Therefore, generate a new port
	// for our runtime to bind its inspector service to.
	const getRuntimeInspectorPort = memoizeGetPort();

	if (config.services && config.services.length > 0) {
		logger.warn(
			`This worker is bound to live services: ${config.services
				.map(
					(service) =>
						`${service.binding} (${service.service}${
							service.environment ? `@${service.environment}` : ""
						})`
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
		throw new Error(
			"The --experimental-public field has been renamed to --assets"
		);
	}

	if (args.public) {
		throw new Error("The --public field has been renamed to --assets");
	}

	if ((args.assets ?? config.assets) && (args.site ?? config.site)) {
		throw new Error("Cannot use Assets and Workers Sites in the same Worker.");
	}

	if (args.assets) {
		logger.warn(
			"The --assets argument is experimental and may change or break at any time"
		);
	}
	const upstreamProtocol =
		args.upstreamProtocol ?? config.dev.upstream_protocol;
	if (upstreamProtocol === "http") {
		logger.warn(
			"Setting upstream-protocol to http is not currently implemented.\n" +
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
		throw new Error(
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
		zoneId,
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

function getBindings(
	configParam: Config,
	env: string | undefined,
	local: boolean,
	args: AdditionalDevProps
): CfWorkerInit["bindings"] {
	const bindings = {
		kv_namespaces: [
			...(configParam.kv_namespaces || []).map(
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
						throw new Error(
							`In development, you should use a separate kv namespace than the one you'd use in production. Please create a new kv namespace with "wrangler kv:namespace create <name> --preview" and add its id as preview_id to the kv_namespace "${binding}" in your wrangler.toml`
						); // Ugh, I really don't like this message very much
					}
					return {
						binding,
						id: preview_id ?? id,
					};
				}
			),
			...(args.kv || []),
		],
		send_email: configParam.send_email,
		// Use a copy of combinedVars since we're modifying it later
		vars: {
			...getVarsForDev(configParam, env),
			...args.vars,
		},
		wasm_modules: configParam.wasm_modules,
		text_blobs: configParam.text_blobs,
		browser: configParam.browser,
		ai: configParam.ai,
		data_blobs: configParam.data_blobs,
		durable_objects: {
			bindings: [
				...(configParam.durable_objects || { bindings: [] }).bindings,
				...(args.durableObjects || []),
			],
		},
		queues: [
			...(configParam.queues.producers || []).map((queue) => {
				return { binding: queue.binding, queue_name: queue.queue };
			}),
		],
		r2_buckets: [
			...(configParam.r2_buckets?.map(
				({ binding, preview_bucket_name, bucket_name, jurisdiction }) => {
					// same idea as kv namespace preview id,
					// same copy-on-write TODO
					if (!preview_bucket_name && !local) {
						throw new Error(
							`In development, you should use a separate r2 bucket than the one you'd use in production. Please create a new r2 bucket with "wrangler r2 bucket create <name>" and add its name as preview_bucket_name to the r2_buckets "${binding}" in your wrangler.toml`
						);
					}
					return {
						binding,
						bucket_name: preview_bucket_name ?? bucket_name,
						jurisdiction,
					};
				}
			) || []),
			...(args.r2 || []),
		],
		dispatch_namespaces: configParam.dispatch_namespaces,
		mtls_certificates: configParam.mtls_certificates,
		services: [...(configParam.services || []), ...(args.services || [])],
		analytics_engine_datasets: configParam.analytics_engine_datasets,
		unsafe: {
			bindings: configParam.unsafe.bindings,
			metadata: configParam.unsafe.metadata,
			capnp: configParam.unsafe.capnp,
		},
		logfwdr: configParam.logfwdr,
		d1_databases: [
			...(configParam.d1_databases ?? []).map((d1Db) => {
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
			}),
			...(args.d1Databases || []),
		],
		vectorize: configParam.vectorize,
		constellation: configParam.constellation,
		hyperdrive: configParam.hyperdrive.map((hyperdrive) => {
			if (!hyperdrive.localConnectionString) {
				throw new Error(
					`In development, you should use a local postgres connection string to emulate hyperdrive functionality. Please setup postgres locally and set the value of "${hyperdrive.binding}"'s "localConnectionString" to the postgres connection string in your wrangler.toml`
				);
			}
			return hyperdrive;
		}),
	};

	return bindings;
}
