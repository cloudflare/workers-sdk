import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MiniflareCoreError } from "../../shared";
import type {
	ParsedInstanceOptions,
	ParsedWorkerOptions,
} from "../../config/schema";
import type {
	Extension,
	Service,
	Worker_Binding,
	Worker_Module,
} from "../../runtime";
import type { Log } from "../../shared";
import type {
	Awaitable,
	QueueConsumerSchema,
	QueueProducerSchema,
} from "../../workers";
import type { DOContainerOptions } from "../do";
import type { HyperdriveProxyController } from "../hyperdrive/hyperdrive-proxy";
import type { UnsafeUniqueKey } from "./constants";
import type { z } from "zod";

// Maps workflow binding names to their workflow options
export interface WorkflowOption {
	name: string;
	className: string;
	scriptName?: string;
}

// Maps **service** names to the Durable Object class names exported by them
export type DurableObjectClassNames = Map<
	string,
	Map<
		/* className */ string,
		{
			enableSql?: boolean;
			unsafeUniqueKey?: UnsafeUniqueKey;
			unsafePreventEviction?: boolean;
			container?: DOContainerOptions;
		}
	>
>;

// Maps queue names to producer worker options.
export type QueueProducers = Map<string, z.infer<typeof QueueProducerSchema>>;

// Maps queue names to the Worker that wishes to consume it. Note each queue
// can only be consumed by one Worker, but one Worker may consume multiple
// queues. Support for multiple consumers of a single queue is not planned
// anytime soon.
export type QueueConsumers = Map<string, z.infer<typeof QueueConsumerSchema>>;

export interface PluginServicesOptions {
	log: Log;
	options: ParsedWorkerOptions;
	sharedOptions: ParsedInstanceOptions;
	workerBindings: Worker_Binding[];
	workerIndex: number;
	additionalModules: Worker_Module[];
	tmpPath: string;
	resourcePersistencePath: string | undefined;
	resourceTmpPath: string | undefined;
	workerNames: string[];
	loopbackHost: string;
	loopbackPort: number;
	publicUrl: string | undefined;

	// ~~Leaky abstractions~~ "Plugin specific options" :)
	durableObjectClassNames: DurableObjectClassNames;
	unsafeEphemeralDurableObjects: boolean;
	queueProducers: QueueProducers;
	queueConsumers: QueueConsumers;
	// True when the dev registry is enabled, i.e. workers in other dev
	// processes may be bound to. Plugins use this to set up service bindings to
	// the dev-registry proxy worker, e.g. so the queue broker can deliver
	// messages to a consumer in another `wrangler dev` process.
	devRegistryEnabled: boolean;
	hyperdriveProxyController: HyperdriveProxyController;
}

export interface ServicesExtensions {
	services: Service[];
	extensions: Extension[];
}

/**
 * Every plugin receives the full parsed per-worker `WorkerOptions` and filters
 * its own bindings out of `options.config.env` / `options.config.exports` /
 * `options.config.triggers` (plus `options.legacy` / `options.dev`).
 */
export interface Plugin {
	bindingTypeDescription?: string;
	getBindings(
		options: ParsedWorkerOptions,
		workerIndex: number
	): Awaitable<Worker_Binding[] | void>;
	getNodeBindings(
		options: ParsedWorkerOptions
	): Awaitable<Record<string, unknown>>;
	getServices(
		options: PluginServicesOptions
	): Awaitable<Service[] | ServicesExtensions | void>;
	getExtensions?(options: {
		options: ParsedWorkerOptions[];
	}): Awaitable<Extension[]>;
}

/**
 * loadExternalPlugins will take a packageName, and attempt to load additional
 * external plugins to add to Miniflare's default ones
 */
export async function loadExternalPlugins(
	packageName: string
): Promise<Record<string, Plugin>> {
	let pluginModule;
	try {
		const pluginPath = require.resolve(packageName);
		const moduleURL = pathToFileURL(pluginPath).href;

		pluginModule = await import(moduleURL);
	} catch (error) {
		throw new MiniflareCoreError(
			"ERR_PLUGIN_LOADING_FAILED",
			`Package ${packageName} could not be loaded. ${error}`
		);
	}
	if (!pluginModule.plugins) {
		throw new MiniflareCoreError(
			"ERR_PLUGIN_LOADING_FAILED",
			`Package ${packageName} did not provide any plugins.`
		);
	}
	return pluginModule.plugins;
}

// When an instance of this class is returned as the binding from `PluginBase#getNodeBindings()`,
// Miniflare will replace it with a proxy to the binding in `workerd`, alongside applying the
// specified overrides (if there is any)
export class ProxyNodeBinding {
	constructor(public proxyOverrideHandler?: ProxyHandler<any>) {}
}

export function namespaceKeys(
	namespaces?: Record<string, unknown> | string[]
): string[] {
	if (Array.isArray(namespaces)) {
		return namespaces;
	} else if (namespaces !== undefined) {
		return Object.keys(namespaces);
	} else {
		return [];
	}
}

export type RemoteProxyConnectionString = URL & {
	__brand: "RemoteProxyConnectionString";
};

export function namespaceEntries(
	namespaces?:
		| Record<
				string,
				| string
				| {
						id: string;
						remoteProxyConnectionString?: RemoteProxyConnectionString;
				  }
		  >
		| string[]
): [
	bindingName: string,
	{ id: string; remoteProxyConnectionString?: RemoteProxyConnectionString },
][] {
	if (Array.isArray(namespaces)) {
		return namespaces.map((bindingName) => [bindingName, { id: bindingName }]);
	} else if (namespaces !== undefined) {
		return Object.entries(namespaces).map(([key, value]) => {
			if (typeof value === "string") {
				return [key, { id: value }];
			}
			return [
				key,
				{
					id: value.id,
					remoteProxyConnectionString: value.remoteProxyConnectionString,
				},
			];
		});
	} else {
		return [];
	}
}

export function maybeParseURL(url: string | undefined): URL | undefined {
	if (typeof url !== "string" || path.isAbsolute(url)) return;
	try {
		return new URL(url);
	} catch {}
}

export function getPersistPath(
	pluginName: string,
	tmpPath: string,
	resourcePersistencePath: string | undefined
): string {
	// If persistence is disabled (no resource persistence path), use "memory"
	// storage. Note we're still returning a path on the file-system here.
	// Miniflare 2's in-memory storage persisted between options reloads. However,
	// we restart the `workerd` process on each reload which would destroy any
	// in-memory data. We'd like to keep Miniflare 2's behaviour, so persist to a
	// temporary path which we destroy on `dispose()`.
	const result =
		resourcePersistencePath === undefined
			? path.join(tmpPath, pluginName)
			: path.join(resourcePersistencePath, pluginName);

	// Normalize to forward slashes for workerd's disk service compatibility on
	// Windows. workerd is a Unix-oriented C++ program and its disk service does
	// not handle Windows backslash paths correctly, resulting in SQLITE_CANTOPEN
	// errors. Forward slashes work for both Node.js fs APIs and workerd on all
	// platforms.
	return result.replaceAll("\\", "/");
}

/**
 * Service names for remote bindings should be unique depending on the remote proxy connection
 * string (since in theory different remote bindings can have different remote proxy connections),
 * however include the whole remote proxy connection string in the service name would make the name
 * too long more cumbersome to deal with, so this function simply takes a remote proxy connection
 * string and generates a suffix for the respective service name using a short sha of the connection
 * string.
 *
 * @param remoteProxyConnectionString the remote proxy connection string for the service
 * @returns suffix to use in the service name
 */
function getRemoteServiceNameSuffix(
	remoteProxyConnectionString: RemoteProxyConnectionString
) {
	const remoteSha = createHash("sha256")
		.update(remoteProxyConnectionString.href)
		.digest("hex");
	const remoteShortSha = remoteSha.slice(0, 6);
	return `remote-${remoteShortSha}`;
}

/**
 * Utility to get the name for a service implementing a user binding
 *
 * @param scope Scope of the service (this usually is the plugin name)
 * @param identifier Identifier to use for the service
 * @param remoteProxyConnectionString Optional remote proxy connection string (in case the service connects to a remote resource)
 * @returns the name for the service
 */
export function getUserBindingServiceName(
	scope: string,
	identifier: string,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): string {
	const localServiceName = `${scope}:${identifier}`;
	if (!remoteProxyConnectionString) {
		return localServiceName;
	}
	const remoteSuffix = getRemoteServiceNameSuffix(remoteProxyConnectionString);
	return `${localServiceName}:${remoteSuffix}`;
}

export * from "./constants";
export * from "./routing";

export {
	getEnvBindingsOfType,
	getExportsOfType,
	getRemoteProxyConnectionString,
	getTriggersOfType,
} from "../../config/schema";
export type {
	MiniflareBinding,
	MiniflareExport,
	MiniflareFetcherBinding,
	MiniflareNodeHandlerBinding,
	MiniflareServiceBinding,
	MiniflareTrigger,
	MiniflareWorkerBinding,
	ParsedDevConfig,
	ParsedInstanceOptions,
	ParsedLegacyConfig,
	ParsedMiniflareWorkerConfig,
	ParsedWorkerOptions,
} from "../../config/schema";
