import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { prepareContainerImagesForDev } from "@cloudflare/containers-shared";
import { getDockerPath } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { Miniflare, Mutex } from "miniflare";
import * as MF from "../../dev/miniflare";
import { logger } from "../../logger";
import { castErrorCause } from "./events";
import {
	convertToConfigBundle,
	getContainerDevOptions,
	getUserWorkerInnerUrlOverrides,
	LocalRuntimeController,
} from "./LocalRuntimeController";
import type { RemoteProxySession } from "../remoteBindings";
import type { ControllerBus } from "./BaseController";
import type { BundleCompleteEvent } from "./events";
import type { Binding } from "./index";

// Ensure DO references from other workers have the same SQL setting as the DO definition in it's original Worker
function ensureMatchingSql(options: MF.Options) {
	const sameWorkerDOSqlEnabled = new Map<string, boolean | undefined>();

	for (const worker of options.workers) {
		for (const designator of Object.values(worker.durableObjects ?? {})) {
			const isObject = typeof designator === "object";
			const className = isObject ? designator.className : designator;
			const enableSql = isObject ? designator.useSQLite : undefined;

			if (!isObject || designator.scriptName === undefined) {
				sameWorkerDOSqlEnabled.set(className, enableSql);
			}
		}
	}

	for (const worker of options.workers) {
		for (const designator of Object.values(worker.durableObjects ?? {})) {
			const isObject = typeof designator === "object";

			if (isObject && designator.scriptName !== undefined) {
				designator.useSQLite = sameWorkerDOSqlEnabled.get(designator.className);
			}
		}
	}
	return options;
}
export class MultiworkerRuntimeController extends LocalRuntimeController {
	constructor(
		bus: ControllerBus,
		private numWorkers: number
	) {
		super(bus);
	}
	// ******************
	//   Event Handlers
	// ******************

	#log = MF.buildLog();
	// Per-worker bundle ID counters — keyed by worker name so that bundles
	// from different workers don't invalidate each other. Only a newer
	// bundle for the *same* worker should cause a stale bail-out.
	#currentBundleIds = new Map<string, number>();
	// Global counter that increments for every onBundleComplete, regardless
	// of which worker it belongs to. Used to guard setOptions/reloadComplete
	// so that we only apply the merged Miniflare config once all pending
	// bundles have been processed — prevents intermediate setOptions calls
	// with a mix of stale and fresh worker configs.
	#globalBundleId = 0;

	// This is given as a shared secret to the Proxy and User workers
	// so that the User Worker can trust aspects of HTTP requests from the Proxy Worker
	// if it provides the secret in a `MF-Proxy-Shared-Secret` header.
	#proxyToUserWorkerAuthenticationSecret = randomUUID();

	// `buildMiniflareOptions()` is asynchronous, meaning if multiple bundle
	// updates were submitted, the second may apply before the first. Therefore,
	// wrap updates in a mutex, so they're always applied in invocation order.
	#mutex = new Mutex();
	#mf?: Miniflare;

	override get mf(): Miniflare | undefined {
		return this.#mf;
	}

	#options = new Map<string, { options: MF.Options; primary: boolean }>();

	#remoteProxySessionsData = new Map<
		string,
		{
			session: RemoteProxySession;
			remoteBindings: Record<string, Binding>;
		} | null
	>();

	// If this doesn't match what is in config, trigger a rebuild.
	// Used for the rebuild hotkey
	#currentContainerBuildId: string | undefined;

	#canStartMiniflare() {
		return (
			[...this.#options.values()].some((o) => o.primary) &&
			[...this.#options.values()].length === this.numWorkers
		);
	}

	#mergedMfOptions(): MF.Options {
		const primary = [...this.#options.values()].find((o) => o.primary);
		assert(primary !== undefined);

		const secondary = [...this.#options.values()].filter((o) => !o.primary);

		return {
			...primary.options,
			workers: [
				...primary.options.workers,
				...secondary.flatMap((o) =>
					o.options.workers.map((w) => {
						// TODO: investigate why ratelimits causes everything to crash
						delete w.ratelimits;
						return w;
					})
				),
			],
		};
	}

	#isStaleBundleFor(workerName: string, id: number): boolean {
		return id !== this.#currentBundleIds.get(workerName);
	}

	async #onBundleComplete(
		data: BundleCompleteEvent,
		id: number,
		globalId: number
	) {
		const workerName = data.config.name;
		try {
			// A newer bundle for this worker has already been queued — skip
			// this stale one before doing any expensive work.
			if (this.#isStaleBundleFor(workerName, id)) {
				return;
			}

			const configBundle = await convertToConfigBundle(data);

			if (data.config.dev?.remote !== false) {
				// note: remote bindings use (transitively) LocalRuntimeController, so we need to import
				// from the module lazily in order to avoid circular dependency issues
				const { maybeStartOrUpdateRemoteProxySession } =
					await import("../remoteBindings");
				const remoteProxySession = await maybeStartOrUpdateRemoteProxySession(
					{
						name: configBundle.name,
						complianceRegion: configBundle.complianceRegion,
						bindings: configBundle.bindings ?? {},
					},
					this.#remoteProxySessionsData.get(data.config.name) ?? null
				);
				this.#remoteProxySessionsData.set(
					data.config.name,
					remoteProxySession ?? null
				);
			}

			// Bail out if a newer bundle for this worker arrived while we
			// were setting up the remote proxy session.
			if (this.#isStaleBundleFor(workerName, id)) {
				return;
			}

			if (
				data.config.containers?.length &&
				this.#currentContainerBuildId !== data.config.dev.containerBuildId
			) {
				logger.log(chalk.dim("⎔ Preparing container image(s)..."));
				// Assemble container options and build if necessary
				assert(
					data.config.dev.containerBuildId,
					"Build ID should be set if containers are enabled and defined"
				);
				const containerOptions = await getContainerDevOptions(
					data.config.containers,
					data.config.dev.containerBuildId
				);
				this.dockerPath = data.config.dev?.dockerPath ?? getDockerPath();
				// keep track of them so we can clean up later
				for (const container of containerOptions ?? []) {
					this.containerImageTagsSeen.add(container.image_tag);
				}
				await prepareContainerImagesForDev({
					dockerPath: this.dockerPath,
					containerOptions,
					onContainerImagePreparationStart: (buildStartEvent) => {
						this.containerBeingBuilt = {
							...buildStartEvent,
							abortRequested: false,
						};
					},
					onContainerImagePreparationEnd: () => {
						this.containerBeingBuilt = undefined;
					},
					logger: logger,
				});
				if (this.containerBeingBuilt) {
					this.containerBeingBuilt.abortRequested = false;
				}

				this.#currentContainerBuildId = data.config.dev.containerBuildId;
				// Miniflare will have logged 'Ready on...' before the containers are built, but that is actually the proxy server :/
				// The actual user worker's miniflare instance is blocked until the containers are built
				logger.log(chalk.dim("⎔ Container image(s) ready"));
			}

			// Bail out if a newer bundle for this worker arrived while we
			// were building container images.
			if (this.#isStaleBundleFor(workerName, id)) {
				return;
			}

			const options = await MF.buildMiniflareOptions(
				this.#log,
				await convertToConfigBundle(data),
				this.#proxyToUserWorkerAuthenticationSecret,
				this.#remoteProxySessionsData.get(data.config.name)?.session
					?.remoteProxyConnectionString,
				(registry) => {
					this.emitDevRegistryUpdateEvent({
						type: "devRegistryUpdate",
						registry,
					});
				}
			);

			this.#options.set(data.config.name, {
				options,
				primary: Boolean(data.config.dev.multiworkerPrimary),
			});

			// Bail out if a newer bundle for this worker arrived while we
			// were building miniflare options — avoid a redundant local
			// server reload.
			if (this.#isStaleBundleFor(workerName, id)) {
				return;
			}

			if (this.#canStartMiniflare()) {
				// Use the global bundle counter to decide whether to apply the
				// merged config. When multiple workers fire onBundleComplete in
				// quick succession (e.g. container rebuild hotkey), each is
				// queued in the mutex. Only the *last* queued handler should
				// call setOptions, because it will have all workers' updated
				// options in #options. Earlier handlers would merge stale
				// options from workers that haven't processed yet, causing
				// Miniflare to start with an incorrect intermediate config.
				if (globalId !== this.#globalBundleId) {
					return;
				}

				const mergedMfOptions = ensureMatchingSql(this.#mergedMfOptions());

				if (this.#mf === undefined) {
					logger.log(chalk.dim("⎔ Starting local server..."));
					this.#mf = new Miniflare(mergedMfOptions);
				} else {
					logger.log(chalk.dim("⎔ Reloading local server..."));

					await this.#mf.setOptions(mergedMfOptions);

					logger.log(chalk.dim("⎔ Local server updated and ready"));
				}

				// All asynchronous `Miniflare` methods will wait for all `setOptions()`
				// calls to complete before resolving. To ensure we get the `url` and
				// `inspectorUrl` for this set of `options`, we protect `#mf` with a mutex,
				// so only one update can happen at a time.
				const userWorkerUrl = await this.#mf.ready;
				const userWorkerInspectorUrl =
					data.config.dev.inspector !== false
						? await this.#mf.getInspectorURL()
						: null;
				// If we received a new `bundleComplete` event for *any* worker
				// before we were able to dispatch a `reloadComplete`, ignore
				// this bundle — the later handler will apply the full config.
				if (globalId !== this.#globalBundleId) {
					return;
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
						userWorkerInspectorUrl: userWorkerInspectorUrl
							? {
									protocol: userWorkerInspectorUrl.protocol,
									hostname: userWorkerInspectorUrl.hostname,
									port: userWorkerInspectorUrl.port,
									pathname: `/core:user:${data.config.name}`,
								}
							: undefined,
						userWorkerInnerUrlOverrides: getUserWorkerInnerUrlOverrides(
							data.config
						),
						headers: {
							// Passing this signature from Proxy Worker allows the User Worker to trust the request.
							"MF-Proxy-Shared-Secret":
								this.#proxyToUserWorkerAuthenticationSecret,
						},
						liveReload: data.config.dev?.liveReload,
						proxyLogsToController:
							data.bundle.entry.format === "service-worker",
					},
				});
			}
		} catch (error) {
			if (
				this.containerBeingBuilt?.abortRequested &&
				error instanceof Error &&
				error.message.startsWith("Docker build exited with code:")
			) {
				// The user caused the container image build to be aborted (e.g. via
				// the rebuild hotkey), so a non-zero exit from `docker build` is
				// expected here and can be safely ignored — after this the dev
				// process either terminates or reloads the container.
				return;
			}
			this.emitErrorEvent({
				type: "error",
				reason: "Error reloading local server",
				cause: castErrorCause(error),
				source: "MultiworkerRuntimeController",
				data: undefined,
			});
		}
	}
	onBundleComplete(data: BundleCompleteEvent) {
		const prev = this.#currentBundleIds.get(data.config.name) ?? 0;
		const id = prev + 1;
		this.#currentBundleIds.set(data.config.name, id);
		const globalId = ++this.#globalBundleId;

		if (data.config.dev?.remote) {
			this.emitErrorEvent({
				type: "error",
				reason: "--remote workers not supported with the multiworker runtime",
				cause: new Error(
					"--remote workers not supported with the multiworker runtime"
				),
				source: "MultiworkerRuntimeController",
				data: undefined,
			});
			return;
		}

		this.emitReloadStartEvent({
			type: "reloadStart",
			config: data.config,
			bundle: data.bundle,
		});

		void this.#mutex.runWith(() => this.#onBundleComplete(data, id, globalId));
	}

	#teardown = async (): Promise<void> => {
		logger.debug("MultiworkerRuntimeController teardown beginning...");
		if (this.#mf) {
			logger.log(chalk.dim("⎔ Shutting down local server..."));
		}

		await this.#mf?.dispose();
		this.#mf = undefined;

		if (this.#remoteProxySessionsData.size > 0) {
			logger.log(chalk.dim("⎔ Shutting down remote connections..."));
		}

		await Promise.all(
			[...this.#remoteProxySessionsData.values()].map(
				(remoteProxySessionData) => remoteProxySessionData?.session?.dispose()
			)
		);

		this.#remoteProxySessionsData.clear();

		logger.debug("MultiworkerRuntimeController teardown complete");
	};
	override async teardown() {
		await super.teardown();
		return this.#mutex.runWith(this.#teardown);
	}
}
