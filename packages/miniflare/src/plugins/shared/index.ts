import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MiniflareCoreError } from "../../shared";
import type {
	Extension,
	Service,
	Worker_Binding,
	Worker_Module,
} from "../../runtime";
import type { Log, OptionalZodTypeOf } from "../../shared";
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

export interface PluginServicesOptions<
	Options extends z.ZodType,
	SharedOptions extends z.ZodType | undefined,
> {
	log: Log;
	options: z.infer<Options>;
	sharedOptions: OptionalZodTypeOf<SharedOptions>;
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
	// Plugin names (e.g. "kv") whose *local* storage is being routed to a shared
	// storage owner process. Plugins listed here should skip standing up their
	// local storage services (disk/DO/migrations); their bindings are rewritten
	// to the storage-owner proxy by `Miniflare`.
	storageOwnerRoutePlugins: Set<string>;
	// When the shared storage owner feature is enabled, plugins that aren't
	// routed to the owner but still persist to `resourcePersistencePath` (Cache,
	// Durable Objects, Workflows) keep their storage per-instance (under
	// `tmpPath`) instead of the shared root, so separate processes don't contend
	// on one database.
	isolateLocalStorage: boolean;
}

export interface ServicesExtensions {
	services: Service[];
	extensions: Extension[];
}

// How a shared storage owner should host one plugin's local storage. Returned by
// `PluginBase.getStorageOwnerHosting`.
export interface StorageOwnerHosting {
	// Option fragment merged into the detached owner process's `MiniflareOptions`
	// so it stands up the corresponding local storage services. The owner runs
	// the same plugin code, so those services get the same (deterministic) names
	// the client targets over the debug port in `routeBindingToStorageOwner`.
	ownerOptions: Record<string, unknown>;
}

export interface PluginBase<
	Options extends z.ZodType,
	SharedOptions extends z.ZodType | undefined,
> {
	options: Options;
	bindingTypeDescription?: string;
	getBindings(
		options: z.infer<Options>,
		workerIndex: number
	): Awaitable<Worker_Binding[] | void>;
	getNodeBindings(
		options: z.infer<Options>
	): Awaitable<Record<string, unknown>>;
	getServices(
		options: PluginServicesOptions<Options, SharedOptions>
	): Awaitable<Service[] | ServicesExtensions | void>;
	getExtensions?(options: {
		options: z.infer<Options>[];
	}): Awaitable<Extension[]>;
	// Shared storage owner (experimental `unsafeSharedStorageOwner`) hooks. Only
	// implemented by plugins whose local storage can be routed to a single owner
	// process. `Miniflare` owns the process/presence/routing orchestration; these
	// let each plugin own the knowledge of its own binding + resource shapes.

	// Rewrite one of this plugin's *local* storage bindings so the op is served by
	// the owner process (via the client-side storage-owner proxy, which reaches
	// the owner's storage service over the debug port), or return `undefined` to
	// leave `binding` unchanged. Called for each binding this plugin emits when
	// its storage is routed to an owner.
	routeBindingToStorageOwner?(
		binding: Worker_Binding
	): Worker_Binding | undefined;
	// Given every worker's options for this plugin, describe how a shared owner
	// should host its local storage, or `undefined` if there's nothing local to
	// share. Used to configure the spawned owner process.
	getStorageOwnerHosting?(
		allOptions: z.infer<Options>[]
	): StorageOwnerHosting | undefined;
}

export type Plugin<
	Options extends z.ZodType,
	SharedOptions extends z.ZodType | undefined = undefined,
> = PluginBase<Options, SharedOptions> &
	(SharedOptions extends undefined
		? { sharedOptions?: undefined }
		: { sharedOptions: SharedOptions });

/**
 * loadExternalPlugins will take a packageName, and attempt to load additional
 * external plugins to add to Miniflare's default ones
 */
export async function loadExternalPlugins(
	packageName: string
): Promise<Record<string, Plugin<z.ZodType>>> {
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

export function namespaceEntries<
	Entry extends {
		id: string;
		remoteProxyConnectionString?: RemoteProxyConnectionString;
	} = { id: string; remoteProxyConnectionString?: RemoteProxyConnectionString },
>(
	namespaces?: Record<string, string | Entry> | string[]
): [bindingName: string, entry: Entry][] {
	if (Array.isArray(namespaces)) {
		return namespaces.map((bindingName) => [
			bindingName,
			{ id: bindingName } as Entry,
		]);
	} else if (namespaces !== undefined) {
		return Object.entries(namespaces).map(([key, value]) => {
			if (typeof value === "string") {
				return [key, { id: value } as Entry];
			}
			return [key, value];
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
