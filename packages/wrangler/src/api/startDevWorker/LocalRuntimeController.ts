import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
	cleanupContainers,
	getDevContainerImageName,
	prepareContainerImagesForDev,
	runDockerCmdWithOutput,
} from "@cloudflare/containers-shared";
import chalk from "chalk";
import { Miniflare, Mutex } from "miniflare";
import * as MF from "../../dev/miniflare";
import { getDockerPath } from "../../environment-variables/misc-variables";
import { logger } from "../../logger";
import { RuntimeController } from "./BaseController";
import { castErrorCause } from "./events";
import {
	convertBindingsToCfWorkerInitBindings,
	convertCfWorkerInitBindingsToBindings,
	unwrapHook,
} from "./utils";
import type { RemoteProxySession } from "../remoteBindings";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	DevRegistryUpdateEvent,
	PreviewTokenExpiredEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
} from "./events";
import type { Binding, File, StartDevWorkerOptions } from "./types";
import type { ContainerDevOptions } from "@cloudflare/containers-shared";

async function getBinaryFileContents(file: File<string | Uint8Array>) {
	if ("contents" in file) {
		if (file.contents instanceof Buffer) {
			return file.contents;
		}
		return Buffer.from(file.contents);
	}
	return readFile(file.path);
}
async function getTextFileContents(file: File<string | Uint8Array>) {
	if ("contents" in file) {
		if (typeof file.contents === "string") {
			return file.contents;
		}
		if (file.contents instanceof Buffer) {
			return file.contents.toString();
		}
		return Buffer.from(file.contents).toString();
	}
	return readFile(file.path, "utf8");
}

function getName(config: StartDevWorkerOptions) {
	return config.name;
}

export async function convertToConfigBundle(
	event: BundleCompleteEvent
): Promise<MF.ConfigBundle> {
	const { bindings, fetchers } = await convertBindingsToCfWorkerInitBindings(
		event.config.bindings
	);

	const crons = [];
	const queueConsumers = [];
	for (const trigger of event.config.triggers ?? []) {
		if (trigger.type === "cron") {
			crons.push(trigger.cron);
		} else if (trigger.type === "queue-consumer") {
			queueConsumers.push(trigger);
		}
	}
	if (event.bundle.entry.format === "service-worker") {
		// For the service-worker format, blobs are accessible on the global scope
		for (const module of event.bundle.modules ?? []) {
			const identifier = MF.getIdentifier(module.name);
			if (module.type === "text") {
				bindings.vars ??= {};
				bindings.vars[identifier] = await getTextFileContents({
					contents: module.content,
				});
			} else if (module.type === "buffer") {
				bindings.data_blobs ??= {};
				bindings.data_blobs[identifier] = await getBinaryFileContents({
					contents: module.content,
				});
			} else if (module.type === "compiled-wasm") {
				bindings.wasm_modules ??= {};
				bindings.wasm_modules[identifier] = await getBinaryFileContents({
					contents: module.content,
				});
			}
		}
		event.bundle = { ...event.bundle, modules: [] };
	}

	return {
		name: event.config.name,
		bundle: event.bundle,
		format: event.bundle.entry.format,
		compatibilityDate: event.config.compatibilityDate,
		compatibilityFlags: event.config.compatibilityFlags,
		complianceRegion: event.config.complianceRegion,
		bindings,
		migrations: event.config.migrations,
		devRegistry: event.config.dev.registry,
		legacyAssetPaths: event.config.legacy?.site?.bucket
			? {
					baseDirectory: event.config.legacy?.site?.bucket,
					assetDirectory: "",
					excludePatterns: event.config.legacy?.site?.exclude ?? [],
					includePatterns: event.config.legacy?.site?.include ?? [],
				}
			: undefined,
		assets: event.config?.assets,
		initialPort: undefined,
		initialIp: "127.0.0.1",
		rules: [],
		...(event.config.dev.inspector === false
			? {
					inspect: false,
					inspectorPort: undefined,
				}
			: {
					inspect: true,
					inspectorPort: 0,
				}),
		localPersistencePath: event.config.dev.persist,
		liveReload: event.config.dev?.liveReload ?? false,
		crons,
		queueConsumers,
		localProtocol: event.config.dev?.server?.secure ? "https" : "http",
		httpsCertPath: event.config.dev?.server?.httpsCertPath,
		httpsKeyPath: event.config.dev?.server?.httpsKeyPath,
		localUpstream: event.config.dev?.origin?.hostname,
		upstreamProtocol: event.config.dev?.origin?.secure ? "https" : "http",
		services: bindings.services,
		serviceBindings: fetchers,
		bindVectorizeToProd: event.config.dev?.bindVectorizeToProd ?? false,
		imagesLocalMode: event.config.dev?.imagesLocalMode ?? false,
		testScheduled: !!event.config.dev.testScheduled,
		tails: event.config.tailConsumers,
		containerDOClassNames: new Set(
			event.config.containers?.map((c) => c.class_name)
		),
		containerBuildId: event.config.dev?.containerBuildId,
		containerEngine: event.config.dev.containerEngine,
		enableContainers: event.config.dev.enableContainers ?? true,
	};
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

	// Set of container images that have been seen in the current dev session.
	// This is used to clean up containers at the end of the dev session.
	containerImageTagsSeen: Set<string> = new Set();
	// Stored here, so it can be used in `cleanupContainers()`
	dockerPath: string | undefined;
	// If this doesn't match what is in config, trigger a rebuild.
	// Used for the rebuild hotkey
	#currentContainerBuildId: string | undefined;

	// Used to store the information and abort handle for the
	// current container that is being built
	containerBeingBuilt?: {
		containerOptions: ContainerDevOptions;
		abort: () => void;
		abortRequested: boolean;
	};

	onBundleStart(_: BundleStartEvent) {
		process.on("exit", () => {
			this.cleanupContainers();
		});
	}

	async #onBundleComplete(data: BundleCompleteEvent, id: number) {
		try {
			const configBundle = await convertToConfigBundle(data);

			const experimentalRemoteBindings =
				data.config.dev.experimentalRemoteBindings ?? false;

			if (experimentalRemoteBindings && !data.config.dev?.remote) {
				// note: remote bindings use (transitively) LocalRuntimeController, so we need to import
				// from the module lazily in order to avoid circular dependency issues
				const { maybeStartOrUpdateRemoteProxySession, pickRemoteBindings } =
					await import("../remoteBindings");

				const remoteBindings = pickRemoteBindings(
					convertCfWorkerInitBindingsToBindings(configBundle.bindings) ?? {}
				);

				const auth =
					Object.keys(remoteBindings).length === 0
						? // If there are no remote bindings (this is a local only session) there's no need to get auth data
							undefined
						: await unwrapHook(data.config.dev.auth);

				this.#remoteProxySessionData =
					await maybeStartOrUpdateRemoteProxySession(
						{
							name: configBundle.name,
							complianceRegion: configBundle.complianceRegion,
							bindings: remoteBindings,
						},
						this.#remoteProxySessionData ?? null,
						auth
					);
			}

			// Assemble container options and build if necessary

			if (
				data.config.containers?.length &&
				data.config.dev.enableContainers &&
				this.#currentContainerBuildId !== data.config.dev.containerBuildId
			) {
				this.dockerPath = data.config.dev?.dockerPath ?? getDockerPath();
				assert(
					data.config.dev.containerBuildId,
					"Build ID should be set if containers are enabled and defined"
				);
				const containerDevOptions = await getContainerDevOptions(
					data.config.containers,
					data.config.dev.containerBuildId
				);

				for (const container of containerDevOptions) {
					// if this was triggered by the rebuild hotkey, delete the old image
					if (this.#currentContainerBuildId !== undefined) {
						runDockerCmdWithOutput(this.dockerPath, [
							"rmi",
							getDevContainerImageName(
								container.class_name,
								this.#currentContainerBuildId
							),
						]);
					}
					this.containerImageTagsSeen.add(container.image_tag);
				}
				logger.log(chalk.dim("⎔ Preparing container image(s)..."));
				await prepareContainerImagesForDev({
					dockerPath: this.dockerPath,
					containerOptions: containerDevOptions,
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
				configBundle,
				this.#proxyToUserWorkerAuthenticationSecret,
				this.#remoteProxySessionData?.session?.remoteProxyConnectionString,
				!!experimentalRemoteBindings,
				(registry) => {
					logger.log(chalk.dim("⎔ Connection status updated"));
					this.emitDevRegistryUpdateEvent({
						type: "devRegistryUpdate",
						registry,
					});
				}
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
				},
			});
		} catch (error) {
			if (
				this.containerBeingBuilt?.abortRequested &&
				error instanceof Error &&
				error.message === "Build exited with code: 1"
			) {
				// The user caused the container image build to be aborted, so it's expected
				// to get a build error here, this can be safely ignored because after this
				// the dev process either terminates or reloads the container
				return;
			}
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

	cleanupContainers = () => {
		if (!this.containerImageTagsSeen.size) {
			return;
		}

		assert(
			this.dockerPath,
			"Docker path should have been set if containers are enabled"
		);
		cleanupContainers(this.dockerPath, this.containerImageTagsSeen);
	};

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
	emitDevRegistryUpdateEvent(data: DevRegistryUpdateEvent): void {
		this.emit("devRegistryUpdate", data);
	}
}

/**
 * @returns Container options suitable for building or pulling images,
 * with image tag set to well-known dev format.
 * Undefined if containers are not enabled or not configured.
 */
export async function getContainerDevOptions(
	containersConfig: NonNullable<BundleCompleteEvent["config"]["containers"]>,
	containerBuildId: string
) {
	const containers: ContainerDevOptions[] = [];
	for (const container of containersConfig) {
		if ("image_uri" in container) {
			containers.push({
				image_uri: container.image_uri,
				class_name: container.class_name,
				image_tag: getDevContainerImageName(
					container.class_name,
					containerBuildId
				),
			});
		} else {
			containers.push({
				dockerfile: container.dockerfile,
				image_build_context: container.image_build_context,
				image_vars: container.image_vars,
				class_name: container.class_name,
				image_tag: getDevContainerImageName(
					container.class_name,
					containerBuildId
				),
			});
		}
	}
	return containers;
}
