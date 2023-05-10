import path from "path";
import { URLSearchParams, fileURLToPath } from "url";
import type { IncomingRequestCfProperties } from "@cloudflare/workers-types/experimental";
import { z } from "zod";
import { RequestInfo, RequestInit, Response } from "../../http";
import {
	Awaitable,
	Log,
	MiniflareCoreError,
	Timers,
	sanitisePath,
} from "../../shared";
import {
	NewStorage,
	createFileStorage,
	createMemoryStorage,
} from "../../storage2";

// TODO: explain why persist passed as header, want options set to be atomic,
//  if set gateway before script update, may be using new persist before new script
export const PersistenceSchema = z.boolean().or(z.string()).optional();
export type Persistence = z.infer<typeof PersistenceSchema>;

export type DispatchFetch = (
	input: RequestInfo,
	init?: RequestInit<Partial<IncomingRequestCfProperties>>
) => Promise<Response>;

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
	new (
		log: Log,
		storage: NewStorage,
		timers: Timers,
		namespace: string,
		dispatchFetch: DispatchFetch
	): Gateway;
}

export const DEFAULT_PERSIST_ROOT = ".mf";

export const PARAM_FILE_UNSANITISE = "unsanitise";

export function maybeParseURL(url: Persistence): URL | undefined {
	if (typeof url !== "string" || path.isAbsolute(url)) return;
	try {
		return new URL(url);
	} catch {}
}

export class GatewayFactory<Gateway> {
	readonly #memoryStorages = new Map<string, NewStorage>();
	readonly #gateways = new Map<string, [Persistence, Gateway]>();

	constructor(
		private readonly log: Log,
		private readonly timers: Timers,
		private readonly dispatchFetch: DispatchFetch,
		private readonly pluginName: string,
		private readonly gatewayClass: GatewayConstructor<Gateway>
	) {}

	#getMemoryStorage(namespace: string) {
		let storage = this.#memoryStorages.get(namespace);
		if (storage !== undefined) return storage;
		this.#memoryStorages.set(namespace, (storage = createMemoryStorage()));
		return storage;
	}

	getStorage(namespace: string, persist: Persistence): NewStorage {
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
				return createFileStorage(root);
			}
			throw new MiniflareCoreError(
				"ERR_PERSIST_UNSUPPORTED",
				`Unsupported "${url.protocol}" persistence protocol for storage: ${url.href}`
			);
		}

		// Otherwise, fallback to file storage
		const root =
			persist === true
				? path.join(DEFAULT_PERSIST_ROOT, this.pluginName, sanitisedNamespace)
				: path.join(persist, sanitisedNamespace);
		return createFileStorage(root);
	}

	get(namespace: string, persist: Persistence): Gateway {
		const cached = this.#gateways.get(namespace);
		if (cached !== undefined && cached[0] === persist) return cached[1];

		const storage = this.getStorage(namespace, persist);
		const gateway = new this.gatewayClass(
			this.log,
			storage,
			this.timers,
			namespace,
			this.dispatchFetch
		);
		this.#gateways.set(namespace, [persist, gateway]);
		return gateway;
	}
}
