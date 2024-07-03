import { spawn } from "node:child_process";
import * as path from "node:path";
import * as util from "node:util";
import { watch } from "chokidar";
import clipboardy from "clipboardy";
import commandExists from "command-exists";
import { Box, Text, useApp, useInput, useStdin } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useErrorHandler, withErrorBoundary } from "react-error-boundary";
import onExit from "signal-exit";
import { fetch } from "undici";
import {
	convertCfWorkerInitBindingstoBindings,
	createDeferred,
	fakeResolvedInput,
} from "../api/startDevWorker/utils";
import { runCustomBuild } from "../deployment-bundle/run-custom-build";
import {
	getBoundRegisteredWorkers,
	getRegisteredWorkers,
	startWorkerRegistry,
	stopWorkerRegistry,
	unregisterWorker,
} from "../dev-registry";
import { getFlag } from "../experimental-flags";
import { logger } from "../logger";
import { isNavigatorDefined } from "../navigator-user-agent";
import openInBrowser from "../open-in-browser";
import { getWranglerTmpDir } from "../paths";
import { requireApiToken } from "../user";
import { openInspector } from "./inspect";
import { Local, maybeRegisterLocalWorker } from "./local";
import { Remote } from "./remote";
import { useEsbuild } from "./use-esbuild";
import { validateDevProps } from "./validate-dev-props";
import type {
	DevEnv,
	ProxyData,
	ReloadCompleteEvent,
	StartDevWorkerInput,
	StartDevWorkerOptions,
	Trigger,
} from "../api";
import type { Config } from "../config";
import type { Route } from "../config/environment";
import type { Entry } from "../deployment-bundle/entry";
import type { NodeJSCompatMode } from "../deployment-bundle/node-compat";
import type { CfModule, CfWorkerInit } from "../deployment-bundle/worker";
import type { StartDevOptions } from "../dev";
import type { WorkerRegistry } from "../dev-registry";
import type { EnablePagesAssetsServiceBindingOptions } from "../miniflare-cli/types";
import type { EphemeralDirectory } from "../paths";
import type { AssetPaths } from "../sites";
import type { EsbuildBundle } from "./use-esbuild";

/**
 * This hooks establishes a connection with the dev registry,
 * and periodically updates itself with details of workers currently
 * running a dev session on this system.
 */
function useDevRegistry(
	name: string | undefined,
	services: Config["services"] | undefined,
	durableObjects: Config["durable_objects"] | undefined,
	mode: "local" | "remote"
): WorkerRegistry {
	const [workers, setWorkers] = useState<WorkerRegistry>({});

	const hasFailedToFetch = useRef(false);

	useEffect(() => {
		// Let's try to start registry
		// TODO: we should probably call this in a loop
		// in case the registry dies elsewhere
		startWorkerRegistry().catch((err) => {
			logger.error("failed to start worker registry", err);
		});

		const interval =
			// TODO: enable this for remote mode as well
			// https://github.com/cloudflare/workers-sdk/issues/1182
			mode === "local"
				? setInterval(() => {
						getBoundRegisteredWorkers({
							name,
							services,
							durableObjects,
						}).then(
							(boundRegisteredWorkers: WorkerRegistry | undefined) => {
								setWorkers((prevWorkers) => {
									if (
										!util.isDeepStrictEqual(boundRegisteredWorkers, prevWorkers)
									) {
										return boundRegisteredWorkers || {};
									}
									return prevWorkers;
								});
							},
							(err) => {
								if (!hasFailedToFetch.current) {
									hasFailedToFetch.current = true;
									logger.warn("Failed to get worker definitions", err);
								}
							}
						);
					}, 300)
				: undefined;

		return () => {
			interval && clearInterval(interval);
			Promise.allSettled([
				name ? unregisterWorker(name) : Promise.resolve(),
				stopWorkerRegistry(),
			]).then(
				([unregisterResult, stopRegistryResult]) => {
					if (unregisterResult.status === "rejected") {
						logger.error(
							"Failed to unregister worker",
							unregisterResult.reason
						);
					}
					if (stopRegistryResult.status === "rejected") {
						logger.error(
							"Failed to stop worker registry",
							stopRegistryResult.reason
						);
					}
				},
				(err) => {
					logger.error("Failed to clear dev registry effect", err);
				}
			);
		};
	}, [name, services, durableObjects, mode]);

	return workers;
}

/**
 * A react-free version of the above hook
 */
export async function devRegistry(
	cb: (workers: WorkerRegistry | undefined) => void
): Promise<(name?: string) => Promise<void>> {
	let previousRegistry: WorkerRegistry | undefined;

	let interval: ReturnType<typeof setInterval>;

	let hasFailedToFetch = false;

	// The new file based registry supports a much more performant listener callback
	if (getFlag("FILE_BASED_REGISTRY")) {
		await startWorkerRegistry(async (registry) => {
			if (!util.isDeepStrictEqual(registry, previousRegistry)) {
				previousRegistry = registry;
				cb(registry);
			}
		});
	} else {
		try {
			await startWorkerRegistry();
		} catch (err) {
			logger.error("failed to start worker registry", err);
		}
		// Else we need to fall back to a polling based approach
		interval = setInterval(async () => {
			try {
				const registry = await getRegisteredWorkers();
				if (!util.isDeepStrictEqual(registry, previousRegistry)) {
					previousRegistry = registry;
					cb(registry);
				}
			} catch (err) {
				if (!hasFailedToFetch) {
					hasFailedToFetch = true;
					logger.warn("Failed to get worker definitions", err);
				}
			}
		}, 300);
	}

	return async (name) => {
		interval && clearInterval(interval);
		try {
			const [unregisterResult, stopRegistryResult] = await Promise.allSettled([
				name ? unregisterWorker(name) : Promise.resolve(),
				stopWorkerRegistry(),
			]);
			if (unregisterResult.status === "rejected") {
				logger.error("Failed to unregister worker", unregisterResult.reason);
			}
			if (stopRegistryResult.status === "rejected") {
				logger.error(
					"Failed to stop worker registry",
					stopRegistryResult.reason
				);
			}
		} catch (err) {
			logger.error("Failed to cleanup dev registry", err);
		}
	};
}

export type DevProps = {
	name: string | undefined;
	noBundle: boolean;
	findAdditionalModules: boolean | undefined;
	entry: Entry;
	initialPort: number;
	initialIp: string;
	inspectorPort: number;
	runtimeInspectorPort: number;
	processEntrypoint: boolean;
	additionalModules: CfModule[];
	rules: Config["rules"];
	accountId: string | undefined;
	initialMode: "local" | "remote";
	jsxFactory: string | undefined;
	jsxFragment: string | undefined;
	tsconfig: string | undefined;
	upstreamProtocol: "https" | "http";
	localProtocol: "https" | "http";
	httpsKeyPath: string | undefined;
	httpsCertPath: string | undefined;
	localUpstream: string | undefined;
	localPersistencePath: string | null;
	liveReload: boolean;
	bindings: CfWorkerInit["bindings"];
	define: Config["define"];
	alias: Config["alias"];
	crons: Config["triggers"]["crons"];
	queueConsumers: Config["queues"]["consumers"];
	isWorkersSite: boolean;
	assetPaths: AssetPaths | undefined;
	assetsConfig: Config["assets"];
	compatibilityDate: string;
	compatibilityFlags: string[] | undefined;
	usageModel: "bundled" | "unbound" | undefined;
	minify: boolean | undefined;
	nodejsCompatMode: NodeJSCompatMode | undefined;
	build: Config["build"];
	env: string | undefined;
	legacyEnv: boolean;
	host: string | undefined;
	routes: Route[] | undefined;
	inspect: boolean;
	onReady:
		| ((ip: string, port: number, proxyData: ProxyData) => void)
		| undefined;
	showInteractiveDevSession: boolean | undefined;
	forceLocal: boolean | undefined;
	enablePagesAssetsServiceBinding?: EnablePagesAssetsServiceBindingOptions;
	firstPartyWorker: boolean | undefined;
	sendMetrics: boolean | undefined;
	testScheduled: boolean | undefined;
	projectRoot: string | undefined;
	rawConfig: Config;
	rawArgs: StartDevOptions;
	devEnv: DevEnv;
};

export function DevImplementation(props: DevProps): JSX.Element {
	validateDevProps(props);

	// only load the UI if we're running in a supported environment
	const { isRawModeSupported } = useStdin();

	return props.showInteractiveDevSession ?? isRawModeSupported ? (
		<InteractiveDevSession {...props} />
	) : (
		<DevSession {...props} local={props.initialMode === "local"} />
	);
}

// This is a nasty hack to allow `useHotkeys` and its "[b] open a browser" feature to read these values
// without triggering a re-render loop when `onReady()` updates them.
// The initially requested port can be different than what's actually used, if, for example, you request port 0.
let ip: string;
let port: number;

// When starting on `port: 0`, we won't know the port to use until `workerd` has started. If the user tries to open the
// browser before we know this, they'll open `localhost:0` which is incorrect.
let portUsable = false;
let portUsablePromiseResolve: () => void;
const portUsablePromise = new Promise<void>(
	(resolve) => (portUsablePromiseResolve = resolve)
);
// If the user has pressed `b`, but the port isn't ready yet, prevent any further presses of `b` opening a browser,
// until the port is ready.
let blockBrowserOpen = false;

function InteractiveDevSession(props: DevProps) {
	const toggles = useHotkeys({
		initial: {
			local: props.initialMode === "local",
			tunnel: false,
		},
		inspectorPort: props.inspectorPort,
		inspect: props.inspect,
		localProtocol: props.localProtocol,
		forceLocal: props.forceLocal,
		worker: props.name,
	});

	ip = props.initialIp;
	port = props.initialPort;

	useTunnel(toggles.tunnel);

	const onReady = (newIp: string, newPort: number, proxyData: ProxyData) => {
		portUsable = true;
		portUsablePromiseResolve();
		ip = newIp;
		port = newPort;
		props.onReady?.(newIp, newPort, proxyData);
	};

	return (
		<>
			<DevSession {...props} local={toggles.local} onReady={onReady} />
			<Box borderStyle="round" paddingLeft={1} paddingRight={1}>
				<Text bold={true}>[b]</Text>
				<Text> open a browser, </Text>
				{props.inspect ? (
					<>
						<Text bold={true}>[d]</Text>
						<Text> open Devtools, </Text>
					</>
				) : null}
				{!props.forceLocal ? (
					<>
						<Text bold={true}>[l]</Text>
						<Text> {toggles.local ? "turn off" : "turn on"} local mode, </Text>
					</>
				) : null}
				<Text bold={true}>[c]</Text>
				<Text> clear console, </Text>
				<Text bold={true}>[x]</Text>
				<Text> to exit</Text>
			</Box>
		</>
	);
}

type DevSessionProps = DevProps & {
	local: boolean;
	experimentalLocal?: boolean;
};

function DevSession(props: DevSessionProps) {
	const [accountId, setAccountIdStateOnly] = useState(props.accountId);
	const accountIdDeferred = useMemo(() => createDeferred<string>(), []);
	const setAccountIdAndResolveDeferred = useCallback(
		(newAccountId: string) => {
			setAccountIdStateOnly(newAccountId);
			accountIdDeferred.resolve(newAccountId);
		},
		[setAccountIdStateOnly, accountIdDeferred]
	);

	useEffect(() => {
		if (props.accountId) {
			setAccountIdAndResolveDeferred(props.accountId);
		}

		// run once on mount only (to synchronize the deferred value with the pre-selected props.accountId)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const devEnv = props.devEnv;
	useEffect(() => {
		return () => {
			void devEnv.teardown();
		};
	}, [devEnv]);

	const workerDefinitions = useDevRegistry(
		props.name,
		props.bindings.services,
		props.bindings.durable_objects,
		props.local ? "local" : "remote"
	);

	const startDevWorkerOptions: StartDevWorkerInput = useMemo(() => {
		const routes =
			props.routes?.map<Extract<Trigger, { type: "route" }>>((r) =>
				typeof r === "string"
					? {
							type: "route",
							pattern: r,
						}
					: { type: "route", ...r }
			) ?? [];
		const queueConsumers =
			props.queueConsumers?.map<Extract<Trigger, { type: "queue-consumer" }>>(
				(c) => ({
					...c,
					type: "queue-consumer",
				})
			) ?? [];

		const crons =
			props.crons?.map<Extract<Trigger, { type: "cron" }>>((c) => ({
				cron: c,
				type: "cron",
			})) ?? [];
		return {
			name: props.name ?? "worker",
			compatibilityDate: props.compatibilityDate,
			compatibilityFlags: props.compatibilityFlags,
			entrypoint: props.entry.file,
			directory: props.entry.directory,
			bindings: convertCfWorkerInitBindingstoBindings(props.bindings),

			triggers: [...routes, ...queueConsumers, ...crons],
			env: props.env,
			build: {
				additionalModules: props.additionalModules,
				processEntrypoint: props.processEntrypoint,
				bundle: !props.noBundle,
				findAdditionalModules: props.findAdditionalModules,
				minify: props.minify,
				moduleRules: props.rules,
				define: props.define,
				custom: {
					command: props.build.command,
					watch: props.build.watch_dir,
					workingDirectory: props.build.cwd,
				},
				jsxFactory: props.jsxFactory,
				jsxFragment: props.jsxFragment,
				tsconfig: props.tsconfig,
				nodejsCompatMode: props.nodejsCompatMode ?? null,
				format: props.entry.format,
				moduleRoot: props.entry.moduleRoot,
			},
			dev: {
				auth: async () => {
					return {
						accountId: await accountIdDeferred.promise,
						apiToken: requireApiToken(),
					};
				},
				remote: !props.local,
				server: {
					hostname: props.initialIp,
					port: props.initialPort,
					secure: props.localProtocol === "https",
					httpsKeyPath: props.httpsKeyPath,
					httpsCertPath: props.httpsCertPath,
				},
				inspector: {
					port: props.inspectorPort,
				},
				origin: {
					secure: props.localProtocol === "https",
					hostname: props.localUpstream,
				},
				liveReload: props.liveReload,
				testScheduled: props.testScheduled,
				persist: "",
			},
			legacy: {
				site:
					props.isWorkersSite && props.assetPaths
						? {
								bucket: path.join(
									props.assetPaths.baseDirectory,
									props.assetPaths?.assetDirectory
								),
								include: props.assetPaths.includePatterns,
								exclude: props.assetPaths.excludePatterns,
							}
						: undefined,
				assets: props.assetsConfig,
				enableServiceEnvironments: !props.legacyEnv,
			},
			unsafe: {
				capnp: props.bindings.unsafe?.capnp,
				metadata: props.bindings.unsafe?.metadata,
			},
		} satisfies StartDevWorkerOptions;
	}, [
		props.routes,
		props.queueConsumers,
		props.crons,
		props.name,
		props.compatibilityDate,
		props.compatibilityFlags,
		props.bindings,
		props.entry,
		props.assetPaths,
		props.isWorkersSite,
		props.local,
		props.assetsConfig,
		props.processEntrypoint,
		props.additionalModules,
		props.env,
		props.legacyEnv,
		props.noBundle,
		props.findAdditionalModules,
		props.minify,
		props.rules,
		props.define,
		props.build.command,
		props.build.watch_dir,
		props.build.cwd,
		props.jsxFactory,
		props.jsxFragment,
		props.tsconfig,
		props.nodejsCompatMode,
		props.initialIp,
		props.initialPort,
		props.localProtocol,
		props.httpsKeyPath,
		props.httpsCertPath,
		props.inspectorPort,
		props.localUpstream,
		props.liveReload,
		props.testScheduled,
		accountIdDeferred,
	]);

	const onBundleStart = useCallback(() => {
		devEnv.proxy.onBundleStart({
			type: "bundleStart",
			config: fakeResolvedInput(startDevWorkerOptions),
		});
	}, [devEnv, startDevWorkerOptions]);
	const onBundleComplete = useCallback(
		(bundle: EsbuildBundle) => {
			devEnv.proxy.onReloadStart({
				type: "reloadStart",
				config: fakeResolvedInput(startDevWorkerOptions),
				bundle,
			});
		},
		[devEnv, startDevWorkerOptions]
	);
	const esbuildStartTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
	const latestReloadCompleteEvent = useRef<ReloadCompleteEvent>();
	const onCustomBuildEnd = useCallback(() => {
		const TIMEOUT = 300;

		clearTimeout(esbuildStartTimeoutRef.current);
		esbuildStartTimeoutRef.current = setTimeout(() => {
			// esbuild did not start within a reasonable time of the custom build finishing
			// so we can assume that the custom build produced the same output
			// and esbuild is choosing not to rebuild the same bundle
			// therefore the previous worker can be considered reloaded
			if (latestReloadCompleteEvent.current) {
				devEnv.proxy.onReloadComplete(latestReloadCompleteEvent.current);
			}
		}, TIMEOUT);

		return () => {
			clearTimeout(esbuildStartTimeoutRef.current);
		};
	}, [devEnv, latestReloadCompleteEvent]);
	const onEsbuildStart = useCallback(() => {
		// see comment in onCustomBuildEnd
		clearTimeout(esbuildStartTimeoutRef.current);

		// we can conditionally call onBundleStart depending on if a custom build was specified
		// if it was, that step already emitted the event
		// but to not leak the conditions as to whether that process was run
		// to anything outside the useCustomBuild hook (currently dependent on props.build.{command,watch_dir})
		// we can just call onBundleStart unconditionally as emitting the event more than once is fine
		// also, if the timeout fired before esbuild started, for some reason, firing this event again is needed
		onBundleStart();
	}, [esbuildStartTimeoutRef, onBundleStart]);

	const directory = useTmpDir(props.projectRoot);

	useEffect(() => {
		// temp: fake these events by calling the handler directly
		devEnv.proxy.onConfigUpdate({
			type: "configUpdate",
			config: fakeResolvedInput(startDevWorkerOptions),
		});
	}, [devEnv, startDevWorkerOptions]);

	useCustomBuild(props.entry, props.build, onBundleStart, onCustomBuildEnd);

	const bundle = useEsbuild({
		entry: props.entry,
		destination: directory,
		jsxFactory: props.jsxFactory,
		processEntrypoint: props.processEntrypoint,
		additionalModules: props.additionalModules,
		rules: props.rules,
		jsxFragment: props.jsxFragment,
		serveAssetsFromWorker: Boolean(
			props.assetPaths && !props.isWorkersSite && props.local
		),
		tsconfig: props.tsconfig,
		minify: props.minify,
		nodejsCompatMode: props.nodejsCompatMode,
		define: props.define,
		alias: props.alias,
		noBundle: props.noBundle,
		findAdditionalModules: props.findAdditionalModules,
		assets: props.assetsConfig,
		durableObjects: props.bindings.durable_objects || { bindings: [] },
		local: props.local,
		// Enable the bundling to know whether we are using dev or deploy
		targetConsumer: "dev",
		testScheduled: props.testScheduled ?? false,
		projectRoot: props.projectRoot,
		onStart: onEsbuildStart,
		onComplete: onBundleComplete,
		defineNavigatorUserAgent: isNavigatorDefined(
			props.compatibilityDate,
			props.compatibilityFlags
		),
	});

	// TODO(queues) support remote wrangler dev
	if (
		!props.local &&
		(props.bindings.queues?.length || props.queueConsumers?.length)
	) {
		logger.warn(
			"Queues are currently in Beta and are not supported in wrangler dev remote mode."
		);
	}

	// this won't be called with props.experimentalDevEnv because useWorker is guarded with the same flag
	const announceAndOnReady: typeof props.onReady = async (
		finalIp,
		finalPort,
		proxyData
	) => {
		// at this point (in the layers of onReady callbacks), we have devEnv in scope
		// so rewrite the onReady params to be the ip/port of the ProxyWorker instead of the UserWorker
		const { proxyWorker } = await devEnv.proxy.ready.promise;
		const url = await proxyWorker.ready;
		finalIp = url.hostname;
		finalPort = parseInt(url.port);

		if (props.local) {
			await maybeRegisterLocalWorker(
				url,
				props.name,
				proxyData.internalDurableObjects,
				proxyData.entrypointAddresses
			);
		}

		if (process.send) {
			process.send(
				JSON.stringify({
					event: "DEV_SERVER_READY",
					ip: finalIp,
					port: finalPort,
				})
			);
		}

		if (bundle) {
			latestReloadCompleteEvent.current = {
				type: "reloadComplete",
				config: fakeResolvedInput(startDevWorkerOptions),
				bundle,
				proxyData,
			};

			devEnv.proxy.onReloadComplete(latestReloadCompleteEvent.current);
		}

		if (props.onReady) {
			props.onReady(finalIp, finalPort, proxyData);
		}
	};

	return props.local ? (
		<Local
			name={props.name}
			bundle={bundle}
			format={props.entry.format}
			compatibilityDate={props.compatibilityDate}
			compatibilityFlags={props.compatibilityFlags}
			usageModel={props.usageModel}
			bindings={props.bindings}
			workerDefinitions={workerDefinitions}
			assetPaths={props.assetPaths}
			initialPort={undefined} // hard-code for userworker, DevEnv-ProxyWorker now uses this prop value
			initialIp={"127.0.0.1"} // hard-code for userworker, DevEnv-ProxyWorker now uses this prop value
			rules={props.rules}
			inspectorPort={props.inspectorPort}
			runtimeInspectorPort={props.runtimeInspectorPort}
			localPersistencePath={props.localPersistencePath}
			liveReload={props.liveReload}
			crons={props.crons}
			queueConsumers={props.queueConsumers}
			localProtocol={"http"} // hard-code for userworker, DevEnv-ProxyWorker now uses this prop value
			httpsKeyPath={props.httpsKeyPath}
			httpsCertPath={props.httpsCertPath}
			localUpstream={props.localUpstream}
			upstreamProtocol={props.upstreamProtocol}
			inspect={props.inspect}
			onReady={announceAndOnReady}
			enablePagesAssetsServiceBinding={props.enablePagesAssetsServiceBinding}
			sourceMapPath={bundle?.sourceMapPath}
			services={props.bindings.services}
		/>
	) : (
		<Remote
			name={props.name}
			bundle={bundle}
			format={props.entry.format}
			bindings={props.bindings}
			assetPaths={props.assetPaths}
			isWorkersSite={props.isWorkersSite}
			port={props.initialPort}
			ip={props.initialIp}
			localProtocol={props.localProtocol}
			httpsKeyPath={props.httpsKeyPath}
			httpsCertPath={props.httpsCertPath}
			inspectorPort={props.inspectorPort}
			// TODO: @threepointone #1167
			// liveReload={props.liveReload}
			inspect={props.inspect}
			compatibilityDate={props.compatibilityDate}
			compatibilityFlags={props.compatibilityFlags}
			usageModel={props.usageModel}
			env={props.env}
			legacyEnv={props.legacyEnv}
			host={props.host}
			routes={props.routes}
			onReady={announceAndOnReady}
			sourceMapPath={bundle?.sourceMapPath}
			sendMetrics={props.sendMetrics}
			// startDevWorker
			accountId={accountId}
			setAccountId={setAccountIdAndResolveDeferred}
		/>
	);
}

function useTmpDir(projectRoot: string | undefined): string | undefined {
	const [directory, setDirectory] = useState<string>();
	const handleError = useErrorHandler();
	useEffect(() => {
		let dir: EphemeralDirectory | undefined;
		try {
			dir = getWranglerTmpDir(projectRoot, "dev");
			setDirectory(dir.path);
			return;
		} catch (err) {
			logger.error(
				"Failed to create temporary directory to store built files."
			);
			handleError(err);
		}
		return () => dir?.remove();
	}, [projectRoot, handleError]);
	return directory;
}

function useCustomBuild(
	expectedEntry: Entry,
	build: Config["build"],
	onStart: () => void,
	onEnd: () => void
): void {
	useEffect(() => {
		if (!build.command) {
			return;
		}
		let watcher: ReturnType<typeof watch> | undefined;
		if (build.watch_dir) {
			watcher = watch(build.watch_dir, {
				persistent: true,
				ignoreInitial: true,
			}).on("all", (_event, filePath) => {
				const relativeFile =
					path.relative(expectedEntry.directory, expectedEntry.file) || ".";
				//TODO: we should buffer requests to the proxy until this completes
				logger.log(`The file ${filePath} changed, restarting build...`);
				onStart();
				runCustomBuild(expectedEntry.file, relativeFile, build)
					.catch((err) => {
						logger.error("Custom build failed:", err);
					})
					.finally(() => {
						onEnd();
					});
			});
		}

		return () => {
			void watcher?.close();
		};
	}, [build, expectedEntry, onStart, onEnd]);
}

function sleep(period: number) {
	return new Promise((resolve) => setTimeout(resolve, period));
}
const SLEEP_DURATION = 2000;
// really need a first class api for this
const hostNameRegex = /userHostname="(.*)"/g;
async function findTunnelHostname() {
	let hostName: string | undefined;
	while (!hostName) {
		try {
			const resp = await fetch("http://localhost:8789/metrics");
			const data = await resp.text();
			const matches = Array.from(data.matchAll(hostNameRegex));
			hostName = matches[0][1];
		} catch (err) {
			await sleep(SLEEP_DURATION);
		}
	}
	return hostName;
}

/**
 * Create a tunnel to the remote worker.
 * We've disabled this for now until we figure out a better user experience.
 */
function useTunnel(toggle: boolean) {
	const tunnel = useRef<ReturnType<typeof spawn>>();
	const removeSignalExitListener = useRef<() => void>();
	// TODO: test if cloudflared is available, if not
	// point them to a url where they can get docs to install it
	useEffect(() => {
		async function startTunnel() {
			if (toggle) {
				try {
					await commandExists("cloudflared");
				} catch (e) {
					logger.warn(
						"To share your worker on the Internet, please install `cloudflared` from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
					);
					return;
				}
				logger.log("⎔ Starting a tunnel...");
				tunnel.current = spawn("cloudflared", [
					"tunnel",
					"--url",
					"http://localhost:8787",
					"--metrics",
					"localhost:8789",
				]);

				tunnel.current.on("close", (code) => {
					if (code) {
						logger.log(`Tunnel process exited with code ${code}`);
					}
				});

				removeSignalExitListener.current = onExit((_code, _signal) => {
					logger.log("⎔ Shutting down local tunnel.");
					tunnel.current?.kill();
					tunnel.current = undefined;
				});

				const hostName = await findTunnelHostname();
				await clipboardy.write(hostName);
				logger.log(`⬣ Sharing at ${hostName}, copied to clipboard.`);
			}
		}

		startTunnel().catch(async (err) => {
			logger.error("tunnel:", err);
		});

		return () => {
			if (tunnel.current) {
				logger.log("⎔ Shutting down tunnel.");
				tunnel.current?.kill();
				tunnel.current = undefined;
				removeSignalExitListener.current && removeSignalExitListener.current();
				removeSignalExitListener.current = undefined;
			}
		};
	}, [toggle]);
}

type useHotkeysInitialState = {
	local: boolean;
	tunnel: boolean;
};
function useHotkeys(props: {
	initial: useHotkeysInitialState;
	inspectorPort: number;
	inspect: boolean;
	localProtocol: "http" | "https";
	forceLocal: boolean | undefined;
	worker: string | undefined;
}) {
	const { initial, inspectorPort, inspect, localProtocol, forceLocal } = props;
	// UGH, we should put port in context instead
	const [toggles, setToggles] = useState(initial);
	const { exit } = useApp();

	useInput(
		async (
			input,
			// eslint-disable-next-line unused-imports/no-unused-vars
			key
		) => {
			switch (input.toLowerCase()) {
				// clear console
				case "c":
					console.clear();
					// This console.log causes Ink to re-render the `DevSession` component.
					// Couldn't find a better way to tell it to do so...
					console.log();
					break;
				// open browser
				case "b": {
					if (port === 0) {
						if (!portUsable) {
							logger.info("Waiting for port...");
						}
						if (blockBrowserOpen) {
							return;
						}
						blockBrowserOpen = true;
						await portUsablePromise;
						blockBrowserOpen = false;
					}
					if (ip === "0.0.0.0" || ip === "*") {
						await openInBrowser(`${localProtocol}://127.0.0.1:${port}`);
						return;
					}
					await openInBrowser(`${localProtocol}://${ip}:${port}`);
					break;
				}
				// toggle inspector
				case "d": {
					if (inspect) {
						await openInspector(inspectorPort, props.worker);
					}
					break;
				}
				// toggle local
				case "l":
					if (forceLocal) {
						return;
					}
					setToggles((previousToggles) => ({
						...previousToggles,
						local: !previousToggles.local,
					}));
					break;
				// shut down
				case "q":
				case "x":
					exit();
					break;
				default:
					// nothing?
					break;
			}
		}
	);
	return toggles;
}

function ErrorFallback(props: { error: Error }) {
	const { exit } = useApp();
	useEffect(() => exit(props.error));
	return (
		<>
			<Text>Something went wrong:</Text>
			<Text>{props.error.stack}</Text>
		</>
	);
}

export default withErrorBoundary(DevImplementation, {
	FallbackComponent: ErrorFallback,
});
