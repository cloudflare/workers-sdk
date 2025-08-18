import crypto, { createHash } from "crypto";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import {
	Extension,
	Service,
	Worker_Binding,
	Worker_Module,
} from "../../runtime";
import {
	Log,
	MiniflareCoreError,
	OptionalZodTypeOf,
	PathSchema,
} from "../../shared";
import {
	Awaitable,
	QueueConsumerSchema,
	QueueProducerSchema,
	sanitisePath,
} from "../../workers";
import { UnsafeUniqueKey } from "./constants";
import type { DOContainerOptions } from "../do";

export const DEFAULT_PERSIST_ROOT = ".mf";

export const PersistenceSchema = z
	// Zod checks union types in order, both `z.string().url()` and `PathSchema`
	// will result in a `string`, but `PathSchema` gets resolved relative to the
	// closest `rootPath`.
	.union([z.boolean(), z.string().url(), PathSchema])
	.optional();
export type Persistence = z.infer<typeof PersistenceSchema>;

// Set of "worker" names that are being used as wrapped bindings and shouldn't
// be added a regular worker services. These workers shouldn't be routable.
export type WrappedBindingNames = Set<string>;

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
	defaultPersistRoot: string | undefined;
	workerNames: string[];
	loopbackPort: number;
	unsafeStickyBlobs: boolean;

	// ~~Leaky abstractions~~ "Plugin specific options" :)
	wrappedBindingNames: WrappedBindingNames;
	durableObjectClassNames: DurableObjectClassNames;
	unsafeEphemeralDurableObjects: boolean;
	queueProducers: QueueProducers;
	queueConsumers: QueueConsumers;
}

export interface ServicesExtensions {
	services: Service[];
	extensions: Extension[];
}

export interface PluginBase<
	Options extends z.ZodType,
	SharedOptions extends z.ZodType | undefined,
> {
	options: Options;
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
	getPersistPath?(
		sharedOptions: OptionalZodTypeOf<SharedOptions>,
		tmpPath: string
	): string;
	getExtensions?(options: {
		options: z.infer<Options>[];
	}): Awaitable<Extension[]>;
}

export type Plugin<
	Options extends z.ZodType,
	SharedOptions extends z.ZodType | undefined = undefined,
> = PluginBase<Options, SharedOptions> &
	(SharedOptions extends undefined
		? { sharedOptions?: undefined }
		: { sharedOptions: SharedOptions });

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

export function maybeParseURL(url: Persistence): URL | undefined {
	if (typeof url !== "string" || path.isAbsolute(url)) return;
	try {
		return new URL(url);
	} catch {}
}

export function getPersistPath(
	pluginName: string,
	tmpPath: string,
	defaultPersistRoot: string | undefined,
	persist: Persistence
): string {
	// If persistence is disabled, use "memory" storage. Note we're still
	// returning a path on the file-system here. Miniflare 2's in-memory storage
	// persisted between options reloads. However, we restart the `workerd`
	// process on each reload which would destroy any in-memory data. We'd like to
	// keep Miniflare 2's behaviour, so persist to a temporary path which we
	// destroy on `dispose()`.
	const memoryishPath = path.join(tmpPath, pluginName);
	if (persist === false) {
		return memoryishPath;
	}

	// If `persist` is undefined, use either the default path or fallback to the tmpPath
	if (persist === undefined) {
		return defaultPersistRoot === undefined
			? memoryishPath
			: path.join(defaultPersistRoot, pluginName);
	}

	// Try parse `persist` as a URL
	const url = maybeParseURL(persist);
	if (url !== undefined) {
		if (url.protocol === "memory:") {
			return memoryishPath;
		} else if (url.protocol === "file:") {
			return fileURLToPath(url);
		}
		throw new MiniflareCoreError(
			"ERR_PERSIST_UNSUPPORTED",
			`Unsupported "${url.protocol}" persistence protocol for storage: ${url.href}`
		);
	}

	// Otherwise, fallback to file storage
	return persist === true
		? path.join(defaultPersistRoot ?? DEFAULT_PERSIST_ROOT, pluginName)
		: persist;
}

// https://github.com/cloudflare/workerd/blob/81d97010e44f848bb95d0083e2677bca8d1658b7/src/workerd/server/workerd-api.c%2B%2B#L436
function durableObjectNamespaceIdFromName(uniqueKey: string, name: string) {
	const key = crypto.createHash("sha256").update(uniqueKey).digest();
	const nameHmac = crypto
		.createHmac("sha256", key)
		.update(name)
		.digest()
		.subarray(0, 16);
	const hmac = crypto
		.createHmac("sha256", key)
		.update(nameHmac)
		.digest()
		.subarray(0, 16);
	return Buffer.concat([nameHmac, hmac]).toString("hex");
}

export async function migrateDatabase(
	log: Log,
	uniqueKey: string,
	persistPath: string,
	namespace: string
) {
	// Check if database exists at previous location
	const sanitisedNamespace = sanitisePath(namespace);
	const previousDir = path.join(persistPath, sanitisedNamespace);
	const previousPath = path.join(previousDir, "db.sqlite");
	const previousWalPath = path.join(previousDir, "db.sqlite-wal");
	if (!existsSync(previousPath)) return;

	// Move database to new location, if database isn't already there
	const id = durableObjectNamespaceIdFromName(uniqueKey, namespace);
	const newDir = path.join(persistPath, uniqueKey);
	const newPath = path.join(newDir, `${id}.sqlite`);
	const newWalPath = path.join(newDir, `${id}.sqlite-wal`);
	if (existsSync(newPath)) {
		log.debug(
			`Not migrating ${previousPath} to ${newPath} as it already exists`
		);
		return;
	}

	log.debug(`Migrating ${previousPath} to ${newPath}...`);
	await fs.mkdir(newDir, { recursive: true });

	try {
		await fs.copyFile(previousPath, newPath);
		if (existsSync(previousWalPath)) {
			await fs.copyFile(previousWalPath, newWalPath);
		}
		await fs.unlink(previousPath);
		await fs.unlink(previousWalPath);
	} catch (e) {
		log.warn(`Error migrating ${previousPath} to ${newPath}: ${e}`);
	}
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
