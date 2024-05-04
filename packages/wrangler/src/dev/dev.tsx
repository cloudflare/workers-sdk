import { spawn } from "node:child_process";
import * as path from "node:path";
import * as util from "node:util";
import { watch } from "chokidar";
import clipboardy from "clipboardy";
import commandExists from "command-exists";
import { Box, Text, useApp, useInput, useStdin } from "ink";
import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useErrorHandler, withErrorBoundary } from "react-error-boundary";
import onExit from "signal-exit";
import { fetch } from "undici";
import { DevEnv } from "../api";
import { runCustomBuild } from "../deployment-bundle/run-custom-build";
import {
	getBoundRegisteredWorkers,
	startWorkerRegistry,
	stopWorkerRegistry,
	unregisterWorker,
} from "../dev-registry";
import { logger } from "../logger";
import { isNavigatorDefined } from "../navigator-user-agent";
import openInBrowser from "../open-in-browser";
import { getWranglerTmpDir } from "../paths";
import { openInspector } from "./inspect";
import { Local, maybeRegisterLocalWorker } from "./local";
import { Remote } from "./remote";
import { useEsbuild } from "./use-esbuild";
import { validateDevProps } from "./validate-dev-props";
import type {
	ProxyData,
	ReloadCompleteEvent,
	StartDevWorkerOptions,
} from "../api";
import type { Config } from "../config";
import type { Route } from "../config/environment";
import type { Entry } from "../deployment-bundle/entry";
import type { CfModule, CfWorkerInit } from "../deployment-bundle/worker";
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
	crons: Config["triggers"]["crons"];
	queueConsumers: Config["queues"]["consumers"];
	isWorkersSite: boolean;
	assetPaths: AssetPaths | undefined;
	assetsConfig: Config["assets"];
	compatibilityDate: string;
	compatibilityFlags: string[] | undefined;
	usageModel: "bundled" | "unbound" | undefined;
	minify: boolean | undefined;
	legacyNodeCompat: boolean | undefined;
	nodejsCompat: boolean | undefined;
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
	const [devEnv] = useState(() => new DevEnv());
	useEffect(() => {
		return () => {
			void devEnv.teardown();
		};
	}, [devEnv]);
	const startDevWorkerOptions: StartDevWorkerOptions = useMemo(
		() => ({
			name: props.name ?? "worker",
			script: { contents: "" },
			dev: {
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
				urlOverrides: {
					secure: props.localProtocol === "https",
					hostname: props.localUpstream,
				},
				liveReload: props.liveReload,
			},
		}),
		[
			props.name,
			props.initialIp,
			props.initialPort,
			props.localProtocol,
			props.httpsKeyPath,
			props.httpsCertPath,
			props.localUpstream,
			props.inspectorPort,
			props.liveReload,
		]
	);

	const onBundleStart = useCallback(() => {
		devEnv.proxy.onBundleStart({
			type: "bundleStart",
			config: startDevWorkerOptions,
		});
	}, [devEnv, startDevWorkerOptions]);
	const esbuildStartTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
	const latestReloadCompleteEvent = useRef<ReloadCompleteEvent>();
	const bundle = useRef<ReturnType<typeof useEsbuild>>();
	const onCustomBuildEnd = useCallback(() => {
		const TIMEOUT = 300; // TODO: find a lower bound for this value

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
	const onReloadStart = useCallback(
		(esbuildBundle: EsbuildBundle) => {
			devEnv.proxy.onReloadStart({
				type: "reloadStart",
				config: startDevWorkerOptions,
				bundle: esbuildBundle,
			});
		},
		[devEnv, startDevWorkerOptions]
	);

	useCustomBuild(props.entry, props.build, onBundleStart, onCustomBuildEnd);

	const directory = useTmpDir(props.projectRoot);

	const workerDefinitions = useDevRegistry(
		props.name,
		props.bindings.services,
		props.bindings.durable_objects,
		props.local ? "local" : "remote"
	);
	useEffect(() => {
		// temp: fake these events by calling the handler directly
		devEnv.proxy.onConfigUpdate({
			type: "configUpdate",
			config: startDevWorkerOptions,
		});
	}, [devEnv, startDevWorkerOptions]);

	bundle.current = useEsbuild({
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
		legacyNodeCompat: props.legacyNodeCompat,
		nodejsCompat: props.nodejsCompat,
		define: props.define,
		noBundle: props.noBundle,
		findAdditionalModules: props.findAdditionalModules,
		assets: props.assetsConfig,
		workerDefinitions,
		services: props.bindings.services,
		durableObjects: props.bindings.durable_objects || { bindings: [] },
		local: props.local,
		// Enable the bundling to know whether we are using dev or deploy
		targetConsumer: "dev",
		testScheduled: props.testScheduled ?? false,
		experimentalLocal: props.experimentalLocal,
		projectRoot: props.projectRoot,
		onStart: onEsbuildStart,
		defineNavigatorUserAgent: isNavigatorDefined(
			props.compatibilityDate,
			props.compatibilityFlags
		),
	});

	// this suffices as an onEsbuildEnd callback
	useEffect(() => {
		if (bundle.current) onReloadStart(bundle.current);
	}, [onReloadStart, bundle]);

	// TODO(queues) support remote wrangler dev
	if (
		!props.local &&
		(props.bindings.queues?.length || props.queueConsumers?.length)
	) {
		logger.warn(
			"Queues are currently in Beta and are not supported in wrangler dev remote mode."
		);
	}

	if (props.local && props.bindings.hyperdrive?.length) {
		logger.warn(
			"Hyperdrive does not currently support 'wrangler dev' in local mode at this stage of the beta. Use the '--remote' flag to test a Hyperdrive configuration before deploying."
		);
	}

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

		if (bundle.current) {
			latestReloadCompleteEvent.current = {
				type: "reloadComplete",
				config: startDevWorkerOptions,
				bundle: bundle.current,
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
			bundle={bundle.current}
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
			sourceMapPath={bundle.current?.sourceMapPath}
			services={props.bindings.services}
		/>
	) : (
		<Remote
			name={props.name}
			bundle={bundle.current}
			format={props.entry.format}
			accountId={props.accountId}
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
			sourceMapPath={bundle.current?.sourceMapPath}
			sendMetrics={props.sendMetrics}
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
		if (!build.command) return;
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
						if (!portUsable) logger.info("Waiting for port...");
						if (blockBrowserOpen) return;
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
					if (forceLocal) return;
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
