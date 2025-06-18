import { randomUUID } from "node:crypto";
import chalk from "chalk";
import { Miniflare, Mutex } from "miniflare";
import * as MF from "../../dev/miniflare";
import { logger } from "../../logger";
import { RuntimeController } from "./BaseController";
import { castErrorCause } from "./events";
import type { WorkerEntrypointsDefinition } from "../../dev-registry";
import type { RemoteProxySession } from "../remoteBindings";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	PreviewTokenExpiredEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
} from "./events";
import type { Binding, StartDevWorkerOptions } from "./types";

function getName(config: StartDevWorkerOptions) {
	return config.name;
}

export class LocalRuntimeController extends RuntimeController {
	// ******************
	//   Event Handlers
	// ******************

	#log = MF.buildLog();
	#currentBundleId = 0;

	// This is given as a shared secret to the Proxy and User workers
	// so that the User Worker can trust aspects of HTTP requests from the Proxy Worker
	// if it provides the secret in a `MF-Proxy-Shared-Secret` header.
	#proxyToUserWorkerAuthenticationSecret = randomUUID();

	// `buildMiniflareOptions()` is asynchronous, meaning if multiple bundle
	// updates were submitted, the second may apply before the first. Therefore,
	// wrap updates in a mutex, so they're always applied in invocation order.
	#mutex = new Mutex();
	#mf?: Miniflare;

	#remoteProxySessionData: {
		session: RemoteProxySession;
		remoteBindings: Record<string, Binding>;
	} | null = null;

	onBundleStart(_: BundleStartEvent) {
		// Ignored in local runtime
	}

	async #onBundleComplete(data: BundleCompleteEvent, id: number) {
		try {
			const experimentalRemoteBindings =
				data.config.dev.experimentalRemoteBindings ?? false;

			if (experimentalRemoteBindings && !data.config.dev?.remote) {
				// note: mixedMode uses (transitively) LocalRuntimeController, so we need to import
				// from the module lazily in order to avoid circular dependency issues
				const { maybeStartOrUpdateRemoteProxySession } = await import(
					"../remoteBindings"
				);

				this.#remoteProxySessionData =
					await maybeStartOrUpdateRemoteProxySession(
						{
							name: data.config.name,
							bindings: data.config.bindings ?? {},
						},
						this.#remoteProxySessionData ?? null
					);
			}

			const { options, internalObjects, entrypointNames } =
				await MF.buildMiniflareOptions(
					this.#log,
					data.config,
					data.bundle,
					this.#proxyToUserWorkerAuthenticationSecret,
					this.#remoteProxySessionData?.session?.remoteProxyConnectionString,
					!!experimentalRemoteBindings
				);
			options.liveReload = false; // TODO: set in buildMiniflareOptions once old code path is removed
			if (this.#mf === undefined) {
				logger.log(chalk.dim("⎔ Starting local server..."));
				this.#mf = new Miniflare(options);
			} else {
				logger.log(chalk.dim("⎔ Reloading local server..."));

				await this.#mf.setOptions(options);
			}
			// All asynchronous `Miniflare` methods will wait for all `setOptions()`
			// calls to complete before resolving. To ensure we get the `url` and
			// `inspectorUrl` for this set of `options`, we protect `#mf` with a mutex,
			// so only one update can happen at a time.
			const userWorkerUrl = await this.#mf.ready;
			// TODO: Miniflare should itself return undefined on
			//       `getInspectorURL` when no inspector is in use
			//       (currently the function just hangs)
			const userWorkerInspectorUrl =
				options.inspectorPort === undefined
					? undefined
					: await this.#mf.getInspectorURL();
			// If we received a new `bundleComplete` event before we were able to
			// dispatch a `reloadComplete` for this bundle, ignore this bundle.
			if (id !== this.#currentBundleId) {
				return;
			}

			// Get entrypoint addresses
			const entrypointAddresses: WorkerEntrypointsDefinition = {};
			for (const name of entrypointNames) {
				const directUrl = await this.#mf.unsafeGetDirectURL(undefined, name);
				const port = parseInt(directUrl.port);
				entrypointAddresses[name] = { host: directUrl.hostname, port };
			}
			this.emitReloadCompleteEvent({
				type: "reloadComplete",
				config: data.config,
				bundle: data.bundle,
				proxyData: {
					userWorkerUrl: {
						protocol: userWorkerUrl.protocol,
						hostname: userWorkerUrl.hostname,
						port: userWorkerUrl.port,
					},
					...(userWorkerInspectorUrl
						? {
								userWorkerInspectorUrl: {
									protocol: userWorkerInspectorUrl.protocol,
									hostname: userWorkerInspectorUrl.hostname,
									port: userWorkerInspectorUrl.port,
									pathname: `/core:user:${getName(data.config)}`,
								},
							}
						: {}),
					userWorkerInnerUrlOverrides: {
						protocol: data.config?.dev?.origin?.secure ? "https:" : "http:",
						hostname: data.config?.dev?.origin?.hostname,
						port: data.config?.dev?.origin?.hostname ? "" : undefined,
					},
					headers: {
						// Passing this signature from Proxy Worker allows the User Worker to trust the request.
						"MF-Proxy-Shared-Secret":
							this.#proxyToUserWorkerAuthenticationSecret,
					},
					liveReload: data.config.dev?.liveReload,
					proxyLogsToController: data.bundle.entry.format === "service-worker",
					internalDurableObjects: internalObjects,
					entrypointAddresses,
				},
			});
		} catch (error) {
			this.emitErrorEvent({
				type: "error",
				reason: "Error reloading local server",
				cause: castErrorCause(error),
				source: "LocalRuntimeController",
				data: undefined,
			});
		}
	}
	onBundleComplete(data: BundleCompleteEvent) {
		const id = ++this.#currentBundleId;

		if (data.config.dev?.remote) {
			void this.teardown();
			return;
		}

		this.emitReloadStartEvent({
			type: "reloadStart",
			config: data.config,
			bundle: data.bundle,
		});
		void this.#mutex.runWith(() => this.#onBundleComplete(data, id));
	}
	onPreviewTokenExpired(_: PreviewTokenExpiredEvent): void {
		// Ignored in local runtime
	}

	#teardown = async (): Promise<void> => {
		logger.debug("LocalRuntimeController teardown beginning...");

		if (this.#mf) {
			logger.log(chalk.dim("⎔ Shutting down local server..."));
		}

		await this.#mf?.dispose();
		this.#mf = undefined;

		if (this.#remoteProxySessionData) {
			logger.log(chalk.dim("⎔ Shutting down remote connection..."));
		}

		await this.#remoteProxySessionData?.session?.dispose();
		this.#remoteProxySessionData = null;

		logger.debug("LocalRuntimeController teardown complete");
	};
	async teardown() {
		return this.#mutex.runWith(this.#teardown);
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitReloadStartEvent(data: ReloadStartEvent) {
		this.emit("reloadStart", data);
	}
	emitReloadCompleteEvent(data: ReloadCompleteEvent) {
		this.emit("reloadComplete", data);
	}
}
