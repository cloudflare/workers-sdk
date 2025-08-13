import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { prepareContainerImagesForDev } from "@cloudflare/containers-shared";
import chalk from "chalk";
import { Miniflare, Mutex } from "miniflare";
import * as MF from "../../dev/miniflare";
import { getDockerPath } from "../../environment-variables/misc-variables";
import { logger } from "../../logger";
import { castErrorCause } from "./events";
import {
	convertToConfigBundle,
	getContainerDevOptions,
	LocalRuntimeController,
} from "./LocalRuntimeController";
import { convertCfWorkerInitBindingsToBindings } from "./utils";
import type { RemoteProxySession } from "../remoteBindings";
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
	constructor(private numWorkers: number) {
		super();
	}
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

	async #onBundleComplete(data: BundleCompleteEvent, id: number) {
		try {
			const configBundle = await convertToConfigBundle(data);

			const experimentalRemoteBindings =
				data.config.dev.experimentalRemoteBindings;

			if (experimentalRemoteBindings && !data.config.dev?.remote) {
				// note: remote bindings use (transitively) LocalRuntimeController, so we need to import
				// from the module lazily in order to avoid circular dependency issues
				const { maybeStartOrUpdateRemoteProxySession } = await import(
					"../remoteBindings"
				);
				const remoteProxySession = await maybeStartOrUpdateRemoteProxySession(
					{
						name: configBundle.name,
						complianceRegion: configBundle.complianceRegion,
						bindings:
							convertCfWorkerInitBindingsToBindings(configBundle.bindings) ??
							{},
					},
					this.#remoteProxySessionsData.get(data.config.name) ?? null
				);
				this.#remoteProxySessionsData.set(
					data.config.name,
					remoteProxySession ?? null
				);
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
				});
				if (this.containerBeingBuilt) {
					this.containerBeingBuilt.abortRequested = false;
				}
				this.#currentContainerBuildId = data.config.dev.containerBuildId;
				// Miniflare will have logged 'Ready on...' before the containers are built, but that is actually the proxy server :/
				// The actual user worker's miniflare instance is blocked until the containers are built
				logger.log(chalk.dim("⎔ Container image(s) ready"));
			}

			const options = await MF.buildMiniflareOptions(
				this.#log,
				await convertToConfigBundle(data),
				this.#proxyToUserWorkerAuthenticationSecret,
				this.#remoteProxySessionsData.get(data.config.name)?.session
					?.remoteProxyConnectionString,
				!!experimentalRemoteBindings,
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

			if (this.#canStartMiniflare()) {
				const mergedMfOptions = ensureMatchingSql(this.#mergedMfOptions());

				if (this.#mf === undefined) {
					logger.log(chalk.dim("⎔ Starting local server..."));
					this.#mf = new Miniflare(mergedMfOptions);
				} else {
					logger.log(chalk.dim("⎔ Reloading local server..."));

					await this.#mf.setOptions(mergedMfOptions);
				}

				// All asynchronous `Miniflare` methods will wait for all `setOptions()`
				// calls to complete before resolving. To ensure we get the `url` and
				// `inspectorUrl` for this set of `options`, we protect `#mf` with a mutex,
				// so only one update can happen at a time.
				const userWorkerUrl = await this.#mf.ready;
				const userWorkerInspectorUrl = await this.#mf.getInspectorURL();
				// If we received a new `bundleComplete` event before we were able to
				// dispatch a `reloadComplete` for this bundle, ignore this bundle.
				if (id !== this.#currentBundleId) {
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
						userWorkerInspectorUrl: {
							protocol: userWorkerInspectorUrl.protocol,
							hostname: userWorkerInspectorUrl.hostname,
							port: userWorkerInspectorUrl.port,
							pathname: `/core:user:${data.config.name}`,
						},
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
						proxyLogsToController:
							data.bundle.entry.format === "service-worker",
					},
				});
			}
		} catch (error) {
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
		const id = ++this.#currentBundleId;

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

		void this.#mutex.runWith(() => this.#onBundleComplete(data, id));
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
	async teardown() {
		return this.#mutex.runWith(this.#teardown);
	}
}
