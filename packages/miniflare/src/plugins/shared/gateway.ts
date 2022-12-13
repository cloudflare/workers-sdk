import path from "path";
import { URLSearchParams, fileURLToPath } from "url";
import { z } from "zod";
import { RequestInit, Response } from "../../http";
import {
	Awaitable,
	Clock,
	Log,
	MiniflareCoreError,
	sanitisePath,
} from "../../shared";
import {
	FileStorage,
	MemoryStorage,
	RemoteStorage,
	SqliteStorage,
	Storage,
} from "../../storage";

// TODO: explain why persist passed as header, want options set to be atomic,
//  if set gateway before script update, may be using new persist before new script
export const PersistenceSchema = z.boolean().or(z.string()).optional();
export type Persistence = z.infer<typeof PersistenceSchema>;

export const CloudflareFetchSchema =
	// TODO(soon): figure out a way to do optional parameters with z.function()
	z.custom<
		(
			resource: string,
			searchParams?: URLSearchParams,
			init?: RequestInit
		) => Awaitable<Response>
	>();
export type CloudflareFetch = z.infer<typeof CloudflareFetchSchema>;

export interface GatewayConstructor<Gateway> {
	new (log: Log, storage: Storage, clock: Clock): Gateway;
}

export interface RemoteStorageConstructor {
	new (
		cache: Storage,
		cloudflareFetch: CloudflareFetch,
		namespace: string
	): RemoteStorage;
}

const DEFAULT_PERSIST_ROOT = ".mf";

export const PARAM_FILE_UNSANITISE = "unsanitise";

function maybeParseURL(url: Persistence): URL | undefined {
	try {
		if (typeof url === "string") return new URL(url);
	} catch {}
}

export class GatewayFactory<Gateway> {
	readonly #memoryStorages = new Map<string, MemoryStorage>();
	readonly #gateways = new Map<string, [Persistence, Gateway]>();

	constructor(
		private readonly log: Log,
		private readonly clock: Clock,
		private readonly cloudflareFetch: CloudflareFetch | undefined,
		private readonly pluginName: string,
		private readonly gatewayClass: GatewayConstructor<Gateway>,
		private readonly remoteStorageClass?: RemoteStorageConstructor
	) {}

	#getMemoryStorage(namespace: string) {
		let storage = this.#memoryStorages.get(namespace);
		if (storage !== undefined) return storage;
		this.#memoryStorages.set(
			namespace,
			(storage = new MemoryStorage(undefined, this.clock))
		);
		return storage;
	}

	getStorage(namespace: string, persist: Persistence): Storage {
		// If persistence is disabled, use memory storage
		if (persist === undefined || persist === false) {
			return this.#getMemoryStorage(namespace);
		}

		// Sanitise namespace to make it file-system safe
		const sanitisedNamespace = sanitisePath(namespace);

		// Try parse `persist` as a URL
		const url = maybeParseURL(persist);
		if (url !== undefined) {
			if (url.protocol === "memory:") {
				return this.#getMemoryStorage(namespace);
			}
			if (url.protocol === "file:") {
				const root = path.join(fileURLToPath(url), sanitisedNamespace);
				const unsanitise =
					url.searchParams.get(PARAM_FILE_UNSANITISE) === "true";
				return new FileStorage(root, !unsanitise, this.clock);
			} else if (url.protocol === "sqlite:") {
				return new SqliteStorage(url.pathname, sanitisedNamespace, this.clock);
			}
			// TODO: support Redis/SQLite storages?
			if (url.protocol === "remote:") {
				const { cloudflareFetch, remoteStorageClass } = this;
				if (cloudflareFetch === undefined) {
					throw new MiniflareCoreError(
						"ERR_PERSIST_REMOTE_UNAUTHENTICATED",
						"Authenticated Cloudflare API `cloudflareFetch` option not provided but required for remote storage"
					);
				}
				if (remoteStorageClass === undefined) {
					throw new MiniflareCoreError(
						"ERR_PERSIST_REMOTE_UNSUPPORTED",
						`The "${this.pluginName}" plugin does not support remote storage`
					);
				}
				const cachePersist = url.searchParams.get("cache") ?? undefined;
				const cache = this.getStorage(namespace, cachePersist);
				return new remoteStorageClass(cache, cloudflareFetch, namespace);
			}
			throw new MiniflareCoreError(
				"ERR_PERSIST_UNSUPPORTED",
				`Unsupported "${url.protocol}" persistence protocol for storage: ${url.href}`
			);
		}

		// Otherwise, fallback to sanitised file storage
		const root =
			persist === true
				? path.join(DEFAULT_PERSIST_ROOT, this.pluginName, sanitisedNamespace)
				: path.join(persist, sanitisedNamespace);
		return new FileStorage(root, undefined, this.clock);
	}

	get(namespace: string, persist: Persistence): Gateway {
		const cached = this.#gateways.get(namespace);
		if (cached !== undefined && cached[0] === persist) return cached[1];

		const storage = this.getStorage(namespace, persist);
		const gateway = new this.gatewayClass(this.log, storage, this.clock);
		this.#gateways.set(namespace, [persist, gateway]);
		return gateway;
	}
}
