import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import SCRIPT from "worker:artifacts/binding";
import SCRIPT_WRAPPED_BINDING from "worker:artifacts/wrapped-binding";
import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getPersistPath,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import { getArtifactsNamespaceEventBindings } from "./events";
import { assertGitAvailable } from "./git-client";
import {
	assertSupportedGitLayout,
	findLocalNamespaces,
	recordLocalNamespace,
} from "./storage";
import type { ParsedInstanceOptions } from "../../config/schema";
import type { Service, Socket } from "../../runtime";
import type {
	MiniflareBinding,
	ParsedDevConfig,
	ParsedWorkerOptions,
	Plugin,
} from "../shared";
import type { ArtifactsController } from "./controller";
import type { ArtifactsEventSubscriptionRoute } from "./events";

export {
	ArtifactsController,
	type LocalArtifactsBackend,
	type LocalArtifactsBackendOptions,
} from "./controller";
export type { GitSidecar } from "./git-sidecar";
// Referenced by the public `PluginServicesOptions`, so the type bundle needs it.
export type { ArtifactsEventSubscriptionRoute } from "./events";

export const ARTIFACTS_PLUGIN_NAME = "artifacts";
const ARTIFACTS_REMOTE_SERVICE_NAME = `${ARTIFACTS_PLUGIN_NAME}:remote`;
const ENTRYPOINT = "LocalArtifactsNamespace";
const EXPLORER_ENTRYPOINT = "LocalArtifactsExplorer";
/** `cf --local` can create repositories here before any binding names it. */
const DEFAULT_NAMESPACE = "default";
const OBJECT_CLASS = "LocalArtifactsNamespaceObject";
const WRAPPED_BINDING_MODULE = `${ARTIFACTS_PLUGIN_NAME}:local-binding`;
const LOCAL_NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

// Artifacts routes like every other binding: remote only when `dev.remote` is
// `true` and the Worker has a remote proxy connection.

/** Returns the namespaces served by the local simulator for these bindings. */
export function getLocalArtifactsNamespaceNames(
	bindings: [
		name: string,
		binding: Extract<MiniflareBinding, { type: "artifacts" }>,
	][],
	dev: ParsedDevConfig | undefined
): Set<string> {
	return new Set(
		bindings
			.filter(([, binding]) => !getRemoteProxyConnectionString(binding, dev))
			.map(([, binding]) => binding.namespace)
	);
}

function validateLocalNamespace(namespace: string): void {
	if (!LOCAL_NAMESPACE_PATTERN.test(namespace)) {
		throw new Error(`Invalid local Artifacts namespace: ${namespace}`);
	}
}

function namespaceId(namespace: string): string {
	// 128 bits keeps storage paths short enough for workerd's SQLite files on Windows.
	return createHash("sha256").update(namespace).digest("hex").slice(0, 32);
}

function localServiceName(namespace: string): string {
	return `${ARTIFACTS_PLUGIN_NAME}-${namespaceId(namespace)}`;
}

/** Local namespaces the Local Explorer API can manage. */
export interface LocalArtifactsExplorerNamespaces {
	/** Every local namespace, whether or not a Worker binds it. */
	namespaces: string[];
	/** Namespaces started only for the explorer, without a Worker binding. */
	unbound: string[];
	/** Why unbound namespaces could not start, such as missing Git. */
	unavailableReason?: string;
}

/**
 * The Local Explorer manages bound namespaces and, without a binding, those
 * persisted under `<persist>/artifacts/`. With shared storage, as `cf --local`
 * uses, `default` is always available so a repository can be created in an
 * empty state directory. Missing Git only disables the unbound namespaces: it
 * must not stop a session that never uses Artifacts.
 */
export async function getLocalArtifactsExplorerNamespaces(
	allWorkerOpts: ParsedWorkerOptions[],
	sharedOptions: Pick<
		ParsedInstanceOptions,
		| "resourcePersistencePath"
		| "unsafeEnableSharedStorage"
		| "unsafeLocalExplorer"
	>,
	tmpPath: string
): Promise<LocalArtifactsExplorerNamespaces> {
	const bound = new Set<string>();
	for (const { config, dev } of allWorkerOpts) {
		for (const namespace of getLocalArtifactsNamespaceNames(
			getEnvBindingsOfType(config, "artifacts"),
			dev
		)) {
			bound.add(namespace);
		}
	}
	if (
		!sharedOptions.unsafeLocalExplorer &&
		!sharedOptions.unsafeEnableSharedStorage
	) {
		return { namespaces: [...bound], unbound: [] };
	}
	const root = getPersistPath(
		ARTIFACTS_PLUGIN_NAME,
		tmpPath,
		sharedOptions.resourcePersistencePath
	);
	const candidates = await findLocalNamespaces(root, namespaceId);
	if (sharedOptions.unsafeEnableSharedStorage) {
		candidates.push(DEFAULT_NAMESPACE);
	}
	const unbound = [...new Set(candidates)].filter(
		(namespace) =>
			!bound.has(namespace) && LOCAL_NAMESPACE_PATTERN.test(namespace)
	);
	if (unbound.length > 0) {
		try {
			await assertGitAvailable();
		} catch (error) {
			return {
				namespaces: [...bound],
				unbound: [],
				unavailableReason:
					error instanceof Error ? error.message : String(error),
			};
		}
	}
	return {
		namespaces: [...bound, ...unbound].sort(),
		unbound: unbound.sort(),
	};
}

/** The binding name of a namespace's Local Explorer service. */
export function getArtifactsExplorerBindingName(namespace: string): string {
	return `MINIFLARE_ARTIFACTS_${namespaceId(namespace)}`;
}

/** The Local Explorer's administrative entrypoint for one local namespace. */
export function getArtifactsExplorerService(namespace: string) {
	return { name: localServiceName(namespace), entrypoint: EXPLORER_ENTRYPOINT };
}

export const ARTIFACTS_PLUGIN: Plugin = {
	bindingTypeDescription: "Artifacts",
	getBindings(options) {
		return getEnvBindingsOfType(options.config, "artifacts").map(
			([name, binding]) => {
				const remoteConnection = getRemoteProxyConnectionString(
					binding,
					options.dev
				);
				if (remoteConnection === undefined) {
					validateLocalNamespace(binding.namespace);
					return {
						name,
						wrapped: {
							moduleName: WRAPPED_BINDING_MODULE,
							innerBindings: [
								{
									name: "namespace",
									service: {
										name: localServiceName(binding.namespace),
										entrypoint: ENTRYPOINT,
									},
								},
							],
						},
					};
				}
				return {
					name,
					service: {
						name: ARTIFACTS_REMOTE_SERVICE_NAME,
						props: buildRemoteProxyProps(remoteConnection, name),
					},
				};
			}
		);
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "artifacts").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({
		options,
		sharedOptions,
		tmpPath,
		workerIndex,
		artifactsController,
		artifactsEventSubscriptions,
		artifactsExplorerNamespaces,
	}) {
		const bindings = getEnvBindingsOfType(options.config, "artifacts");
		const services: Service[] = [];
		const sockets: Socket[] = [];
		if (
			bindings.some(([, binding]) =>
				getRemoteProxyConnectionString(binding, options.dev)
			)
		) {
			services.push({
				name: ARTIFACTS_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			});
		}
		const namespaces = getLocalArtifactsNamespaceNames(bindings, options.dev);
		if (namespaces.size > 0) {
			await assertGitAvailable();
		}
		const root = getPersistPath(
			ARTIFACTS_PLUGIN_NAME,
			tmpPath,
			sharedOptions.resourcePersistencePath
		);

		for (const namespace of namespaces) {
			const local = await createLocalNamespaceRuntime(
				root,
				namespace,
				artifactsController,
				artifactsEventSubscriptions,
				{ bound: true }
			);
			sockets.push(local.socket);
			services.push(...local.services);
		}
		// Unbound namespaces are instance-wide, so start them once.
		if (workerIndex === 0) {
			for (const namespace of artifactsExplorerNamespaces.unbound) {
				const local = await createLocalNamespaceRuntime(
					root,
					namespace,
					artifactsController,
					artifactsEventSubscriptions,
					{ bound: false }
				);
				sockets.push(local.socket);
				services.push(...local.services);
			}
		}
		return { services, extensions: [], sockets };
	},
	getExtensions({ options }) {
		const hasLocalBinding = options.some((worker) =>
			getEnvBindingsOfType(worker.config, "artifacts").some(
				([, binding]) => !getRemoteProxyConnectionString(binding, worker.dev)
			)
		);
		if (!hasLocalBinding) {
			return [];
		}
		return [
			{
				modules: [
					{
						name: WRAPPED_BINDING_MODULE,
						esModule: SCRIPT_WRAPPED_BINDING(),
						internal: true,
					},
				],
			},
		];
	},
};

async function createLocalNamespaceRuntime(
	root: string,
	namespace: string,
	artifactsController: ArtifactsController,
	eventSubscriptions: ArtifactsEventSubscriptionRoute[],
	{ bound }: { bound: boolean }
): Promise<{ services: Service[]; socket: Socket }> {
	await mkdir(root, { recursive: true });
	await assertSupportedGitLayout(root);
	const persistPath = path.join(root, namespaceId(namespace));
	const metadataPath = path.join(persistPath, "metadata").replaceAll("\\", "/");
	await mkdir(metadataPath, { recursive: true });
	await assertSupportedGitLayout(metadataPath);
	const { createdAt } = await recordLocalNamespace(persistPath, namespace);
	// Only bound namespaces print their remote prefix: an explorer-only
	// instance, such as one `cf --local` command, may stop straight away.
	const { sidecar, port, advertisedPort } = await artifactsController.get(
		path.join(persistPath, "git"),
		{
			...(bound ? { namespace } : {}),
			portFile: path.join(persistPath, "git-port"),
			keepRecordedPort: !bound,
		}
	);
	const serviceName = localServiceName(namespace);
	const storageName = `${serviceName}-storage`;
	const backendName = `${serviceName}-backend`;
	const socket: Socket = {
		name: `${serviceName}-git`,
		address: `127.0.0.1:${port}`,
		http: {},
		service: { name: serviceName, entrypoint: ENTRYPOINT },
	};
	const storageService: Service = {
		name: storageName,
		disk: { path: metadataPath, writable: true },
	};
	const gitBackendService: Service = {
		name: backendName,
		external: {
			address: sidecar.address,
			http: {
				injectRequestHeaders: [
					{ name: "X-Local-Artifacts-Backend", value: sidecar.secret },
				],
			},
		},
	};
	const bindingService: Service = {
		name: serviceName,
		worker: {
			compatibilityDate: "2026-09-03",
			modules: [{ name: "binding.worker.js", esModule: SCRIPT() }],
			bindings: [
				{
					name: "config",
					json: JSON.stringify({
						namespace,
						origin: `http://127.0.0.1:${advertisedPort}`,
						createdAt,
					}),
				},
				{
					name: "localArtifactsNamespace",
					durableObjectNamespace: { className: OBJECT_CLASS },
				},
				{ name: "gitBackend", service: { name: backendName } },
				...getArtifactsNamespaceEventBindings(eventSubscriptions, namespace),
			],
			// Keys must be unique across namespaces in one workerd, but should
			// not repeat the long service prefix in SQLite's directory name.
			durableObjectNamespaces: [
				{ className: OBJECT_CLASS, uniqueKey: namespaceId(namespace) },
			],
			durableObjectStorage: { localDisk: storageName },
		},
	};
	return {
		services: [storageService, gitBackendService, bindingService],
		socket,
	};
}
