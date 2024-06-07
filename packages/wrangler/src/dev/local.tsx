import assert from "node:assert";
import chalk from "chalk";
import { useEffect, useRef } from "react";
import onExit from "signal-exit";
import { registerWorker } from "../dev-registry";
import { logger } from "../logger";
import { DEFAULT_WORKER_NAME, MiniflareServer } from "./miniflare";
import type { ProxyData } from "../api";
import type { Config } from "../config";
import type {
	CfDurableObject,
	CfScriptFormat,
	CfWorkerInit,
} from "../deployment-bundle/worker";
import type {
	WorkerEntrypointsDefinition,
	WorkerRegistry,
} from "../dev-registry";
import type { EnablePagesAssetsServiceBindingOptions } from "../miniflare-cli/types";
import type { AssetPaths } from "../sites";
import type { ConfigBundle } from "./miniflare";
import type { EsbuildBundle } from "./use-esbuild";

export interface LocalProps {
	name: string | undefined;
	bundle: EsbuildBundle | undefined;
	format: CfScriptFormat | undefined;
	compatibilityDate: string;
	compatibilityFlags: string[] | undefined;
	usageModel: "bundled" | "unbound" | undefined;
	bindings: CfWorkerInit["bindings"];
	workerDefinitions: WorkerRegistry | undefined;
	assetPaths: AssetPaths | undefined;
	initialPort: number | undefined;
	initialIp: string;
	rules: Config["rules"];
	inspectorPort: number;
	runtimeInspectorPort: number;
	localPersistencePath: string | null;
	liveReload: boolean;
	crons: Config["triggers"]["crons"];
	queueConsumers: Config["queues"]["consumers"];
	localProtocol: "http" | "https";
	upstreamProtocol: "http" | "https";
	httpsKeyPath: string | undefined;
	httpsCertPath: string | undefined;
	localUpstream: string | undefined;
	inspect: boolean;
	onReady:
		| ((ip: string, port: number, proxyData: ProxyData) => void)
		| undefined;
	enablePagesAssetsServiceBinding?: EnablePagesAssetsServiceBindingOptions;
	testScheduled?: boolean;
	sourceMapPath: string | undefined;
	services: Config["services"] | undefined;
	experimentalDevEnv: boolean;
}

// TODO(soon): we should be able to remove this function when we fully migrate
//  to the new proposed Wrangler architecture. The `Bundler` component should
//  emit events containing a `ConfigBundle` we can feed into the dev server
//  components.
export async function localPropsToConfigBundle(
	props: LocalProps
): Promise<ConfigBundle> {
	assert(props.bundle !== undefined);
	const serviceBindings: ConfigBundle["serviceBindings"] = {};
	if (props.enablePagesAssetsServiceBinding !== undefined) {
		// `../miniflare-cli/assets` dynamically imports`@cloudflare/pages-shared/environment-polyfills`.
		// `@cloudflare/pages-shared/environment-polyfills/types.ts` defines `global`
		// augmentations that pollute the `import`-site's typing environment.
		//
		// We `require` instead of `import`ing here to avoid polluting the main
		// `wrangler` TypeScript project with the `global` augmentations. This
		// relies on the fact that `require` is untyped.
		//
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const generateASSETSBinding = require("../miniflare-cli/assets").default;
		serviceBindings.ASSETS = await generateASSETSBinding({
			log: logger,
			...props.enablePagesAssetsServiceBinding,
		});
	}
	return {
		name: props.name,
		bundle: props.bundle,
		format: props.format,
		compatibilityDate: props.compatibilityDate,
		compatibilityFlags: props.compatibilityFlags,
		inspectorPort: props.runtimeInspectorPort,
		bindings: props.bindings,
		workerDefinitions: props.workerDefinitions,
		assetPaths: props.assetPaths,
		initialPort: props.initialPort,
		initialIp: props.initialIp,
		rules: props.rules,
		localPersistencePath: props.localPersistencePath,
		liveReload: props.liveReload,
		crons: props.crons,
		queueConsumers: props.queueConsumers,
		localProtocol: props.localProtocol,
		httpsKeyPath: props.httpsKeyPath,
		httpsCertPath: props.httpsCertPath,
		localUpstream: props.localUpstream,
		upstreamProtocol: props.upstreamProtocol,
		inspect: props.inspect,
		services: props.services,
		serviceBindings,
	};
}

export function maybeRegisterLocalWorker(
	url: URL,
	name: string | undefined,
	internalDurableObjects: CfDurableObject[] | undefined,
	entrypointAddresses: WorkerEntrypointsDefinition | undefined
) {
	console.log("registering", name, "with", url.href);
	if (name === undefined) {
		return;
	}

	let protocol = url.protocol;
	protocol = protocol.substring(0, url.protocol.length - 1);
	if (protocol !== "http" && protocol !== "https") {
		return;
	}

	const port = parseInt(url.port);
	return registerWorker(name, {
		protocol,
		mode: "local",
		port,
		host: url.hostname,
		durableObjects: (internalDurableObjects ?? []).map((binding) => ({
			name: binding.name,
			className: binding.class_name,
		})),
		durableObjectsHost: url.hostname,
		durableObjectsPort: port,
		entrypointAddresses: entrypointAddresses,
	});
}

export function Local(props: LocalProps) {
	useEffect(() => {
		if (props.bindings.services && props.bindings.services.length > 0) {
			logger.warn(
				"⎔ Support for service bindings in local mode is experimental and may change."
			);
		}
	}, [props.bindings.services]);

	useEffect(() => {
		const externalDurableObjects = (
			props.bindings.durable_objects?.bindings || []
		).filter((binding) => binding.script_name);

		if (externalDurableObjects.length > 0) {
			logger.warn(
				"⎔ Support for external Durable Objects in local mode is experimental and may change."
			);
		}
	}, [props.bindings.durable_objects?.bindings]);

	if (!props.experimentalDevEnv) {
		// this condition WILL be static and therefore safe to wrap around a hook
		// eslint-disable-next-line react-hooks/rules-of-hooks
		useLocalWorker(props);
	}

	return null;
}

function useLocalWorker(props: LocalProps) {
	const miniflareServerRef = useRef<MiniflareServer>();
	const removeMiniflareServerExitListenerRef = useRef<() => void>();

	useEffect(() => {
		const abortController = new AbortController();

		if (!props.bundle || !props.format) {
			return;
		}
		let server = miniflareServerRef.current;
		if (server === undefined) {
			logger.log(chalk.dim("⎔ Starting local server..."));
			const newServer = new MiniflareServer();
			miniflareServerRef.current = server = newServer;
			server.addEventListener("reloaded", async (event) => {
				const proxyData: ProxyData = {
					userWorkerUrl: {
						protocol: event.url.protocol,
						hostname: event.url.hostname,
						port: event.url.port,
					},
					userWorkerInspectorUrl: {
						protocol: "ws:",
						hostname: "127.0.0.1",
						port: props.runtimeInspectorPort.toString(),
						pathname: `/core:user:${props.name ?? DEFAULT_WORKER_NAME}`,
					},
					userWorkerInnerUrlOverrides: {
						protocol: props.upstreamProtocol,
						hostname: props.localUpstream,
						port: props.localUpstream ? "" : undefined, // `localUpstream` was essentially `host`, not `hostname`, so if it was set delete the `port`
					},
					headers: {
						// Passing this signature from Proxy Worker allows the User Worker to trust the request.
						"MF-Proxy-Shared-Secret":
							event.proxyToUserWorkerAuthenticationSecret,
					},
					liveReload: props.liveReload,
					// in local mode, the logs are already being printed to the console by workerd but only for workers written in "module" format
					// workers written in "service-worker" format still need to proxy logs to the ProxyController
					proxyLogsToController: props.format === "service-worker",
					internalDurableObjects: event.internalDurableObjects,
					entrypointAddresses: event.entrypointAddresses,
				};

				props.onReady?.(
					event.url.hostname,
					parseInt(event.url.port),
					proxyData
				);
			});
			server.addEventListener("error", ({ error }) => {
				if (
					typeof error === "object" &&
					error !== null &&
					"code" in error &&
					(error as { code: string }).code === "ERR_RUNTIME_FAILURE"
				) {
					// Don't log a full verbose stack-trace when Miniflare 3's workerd instance fails to start.
					// workerd will log its own errors, and our stack trace won't have any useful information.
					logger.error(String(error));
				} else {
					logger.error("Error reloading local server:", error);
				}
			});
			removeMiniflareServerExitListenerRef.current = onExit(() => {
				logger.log(chalk.dim("⎔ Shutting down local server..."));
				void newServer.onDispose();
				miniflareServerRef.current = undefined;
			});
		} else {
			logger.log(chalk.dim("⎔ Reloading local server..."));
		}

		const currentServer = server;
		void localPropsToConfigBundle(props).then((config) =>
			currentServer.onBundleUpdate(config, { signal: abortController.signal })
		);

		return () => abortController.abort();
	}, [props]);

	// Rather than disposing the Miniflare server on every reload, only dispose
	// it if local mode is disabled and the `Local` component is unmounted. This
	// allows us to use the more efficient `Miniflare#setOptions` on reload which
	// retains internal state (e.g. in-memory data, the loopback server).
	useEffect(
		() => () => {
			if (miniflareServerRef.current) {
				logger.log(chalk.dim("⎔ Shutting down local server..."));
				// Initialisation errors are also thrown asynchronously by dispose().
				// The `addEventListener("error")` above should've caught them though.
				void miniflareServerRef.current.onDispose().catch(() => {});
				miniflareServerRef.current = undefined;
			}
			removeMiniflareServerExitListenerRef.current?.();
			removeMiniflareServerExitListenerRef.current = undefined;
		},
		[]
	);
}
