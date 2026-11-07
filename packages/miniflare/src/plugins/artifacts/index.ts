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
import { assertGitAvailable } from "./git-client";
import { assertSupportedGitLayout } from "./storage";
import type { Service, Socket } from "../../runtime";
import type { MiniflareBinding, ParsedDevConfig, Plugin } from "../shared";
import type { ArtifactsController } from "./controller";

export {
	ArtifactsController,
	type LocalArtifactsBackend,
	type LocalArtifactsBackendOptions,
} from "./controller";
export type { GitSidecar } from "./git-sidecar";

export const ARTIFACTS_PLUGIN_NAME = "artifacts";
const ARTIFACTS_REMOTE_SERVICE_NAME = `${ARTIFACTS_PLUGIN_NAME}:remote`;
const ENTRYPOINT = "LocalArtifactsNamespace";
const OBJECT_CLASS = "LocalArtifactsNamespaceObject";
const WRAPPED_BINDING_MODULE = `${ARTIFACTS_PLUGIN_NAME}:local-binding`;
const LOCAL_NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

type ArtifactsBinding = Extract<MiniflareBinding, { type: "artifacts" }>;
type ArtifactsEntry = [name: string, binding: ArtifactsBinding];

// Artifacts routes like every other binding: remote only when `dev.remote` is
// `true` and the Worker has a remote proxy connection. Its deployed-by-default
// rule is resolved before Miniflare, by `resolveBindingRemote()` in
// `@cloudflare/workers-utils` for Wrangler configs and by
// `resolveLocalBindings()` for `cloudflare.config.ts`.

function getLocalNamespaceNames(
	bindings: ArtifactsEntry[],
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
	async getServices({ options, sharedOptions, tmpPath, artifactsController }) {
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
		const namespaces = getLocalNamespaceNames(bindings, options.dev);
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
				artifactsController
			);
			sockets.push(local.socket);
			services.push(...local.services);
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
	artifactsController: ArtifactsController
): Promise<{ services: Service[]; socket: Socket }> {
	await mkdir(root, { recursive: true });
	await assertSupportedGitLayout(root);
	const persistPath = path.join(root, namespaceId(namespace));
	const metadataPath = path.join(persistPath, "metadata").replaceAll("\\", "/");
	await mkdir(metadataPath, { recursive: true });
	await assertSupportedGitLayout(metadataPath);
	const { sidecar, port } = await artifactsController.get(
		path.join(persistPath, "git"),
		{ namespace, portFile: path.join(persistPath, "git-port") }
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
						origin: `http://127.0.0.1:${port}`,
					}),
				},
				{
					name: "localArtifactsNamespace",
					durableObjectNamespace: { className: OBJECT_CLASS },
				},
				{ name: "gitBackend", service: { name: backendName } },
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
