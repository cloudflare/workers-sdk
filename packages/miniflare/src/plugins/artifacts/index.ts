import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import SCRIPT from "worker:artifacts/binding";
import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getPersistPath,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Service, Socket } from "../../runtime";
import type { MiniflareBinding, Plugin } from "../shared";
import type { ArtifactsController } from "./controller";

export { ArtifactsController, type LocalArtifactsBackend } from "./controller";
export type { GitSidecar } from "./git-sidecar";

export const ARTIFACTS_PLUGIN_NAME = "artifacts";
const ARTIFACTS_REMOTE_SERVICE_NAME = `${ARTIFACTS_PLUGIN_NAME}:remote`;
const ENTRYPOINT = "LocalArtifactsNamespace";
const OBJECT_CLASS = "LocalArtifactsNamespaceObject";
const LOCAL_NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

type ArtifactsBinding = Extract<MiniflareBinding, { type: "artifacts" }>;
type ArtifactsEntry = [name: string, binding: ArtifactsBinding];

function isLocalArtifactsBinding(binding: ArtifactsBinding): boolean {
	return binding.dev?.remote !== true;
}

function getLocalNamespaceNames(bindings: ArtifactsEntry[]): Set<string> {
	return new Set(
		bindings
			.filter(([, binding]) => isLocalArtifactsBinding(binding))
			.map(([, binding]) => binding.namespace)
	);
}

function validateLocalNamespace(namespace: string): void {
	if (!LOCAL_NAMESPACE_PATTERN.test(namespace)) {
		throw new Error(`Invalid local Artifacts namespace: ${namespace}`);
	}
}

function namespaceId(namespace: string): string {
	return createHash("sha256").update(namespace).digest("hex");
}

function localServiceName(namespace: string): string {
	return `${ARTIFACTS_PLUGIN_NAME}:${namespaceId(namespace)}`;
}

export const ARTIFACTS_PLUGIN: Plugin = {
	bindingTypeDescription: "Artifacts",
	getBindings(options) {
		return getEnvBindingsOfType(options.config, "artifacts").map(
			([name, binding]) => {
				// Offline by default; remote proxying requires explicit opt-in.
				if (isLocalArtifactsBinding(binding)) {
					validateLocalNamespace(binding.namespace);
					return {
						name,
						service: {
							name: localServiceName(binding.namespace),
							entrypoint: ENTRYPOINT,
						},
					};
				}
				return {
					name,
					service: {
						name: ARTIFACTS_REMOTE_SERVICE_NAME,
						props: buildRemoteProxyProps(
							getRemoteProxyConnectionString(binding, options.dev),
							name
						),
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
		if (bindings.some(([, binding]) => !isLocalArtifactsBinding(binding))) {
			services.push({
				name: ARTIFACTS_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			});
		}
		const namespaces = getLocalNamespaceNames(bindings);
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
};

async function createLocalNamespaceRuntime(
	root: string,
	namespace: string,
	artifactsController: ArtifactsController
): Promise<{ services: Service[]; socket: Socket }> {
	const persistPath = path.join(root, namespaceId(namespace));
	const metadataPath = path.join(persistPath, "metadata").replaceAll("\\", "/");
	await mkdir(metadataPath, { recursive: true });
	const { sidecar, port } = await artifactsController.get(
		path.join(persistPath, "git")
	);
	const serviceName = localServiceName(namespace);
	const storageName = `${serviceName}:storage`;
	const backendName = `${serviceName}:backend`;
	const socket: Socket = {
		name: `${serviceName}:git`,
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
			durableObjectNamespaces: [
				{ className: OBJECT_CLASS, uniqueKey: serviceName },
			],
			durableObjectStorage: { localDisk: storageName },
		},
	};
	return {
		services: [storageService, gitBackendService, bindingService],
		socket,
	};
}
