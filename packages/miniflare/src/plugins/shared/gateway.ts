import path from "path";
import { Clock, Storage, defaultClock, sanitisePath } from "@miniflare/shared";
import { FileStorage } from "@miniflare/storage-file";
import { MemoryStorage } from "@miniflare/storage-memory";
import { z } from "zod";

// TODO: explain why persist passed as header, want options set to be atomic,
//  if set gateway before script update, may be using new persist before new script
export const PersistenceSchema = z.boolean().or(z.string()).optional();
export type Persistence = z.infer<typeof PersistenceSchema>;

export interface GatewayConstructor<Gateway> {
	new (storage: Storage, clock: Clock): Gateway;
}

const DEFAULT_PERSIST_ROOT = ".mf";

export class GatewayFactory<Gateway> {
	readonly #memoryStorages = new Map<string, MemoryStorage>();
	readonly #gateways = new Map<string, [Persistence, Gateway]>();

	constructor(
		private readonly pluginName: string,
		private readonly gatewayClass: GatewayConstructor<Gateway>
	) {}

	#storage(namespace: string, persist: Persistence): Storage {
		if (persist === undefined || persist === false) {
			let storage = this.#memoryStorages.get(namespace);
			if (storage !== undefined) return storage;
			this.#memoryStorages.set(namespace, (storage = new MemoryStorage()));
			return storage;
		}

		const sanitised = sanitisePath(namespace);
		const root =
			persist === true
				? path.join(DEFAULT_PERSIST_ROOT, this.pluginName, sanitised)
				: path.join(persist, sanitised);
		return new FileStorage(root);

		// TODO: support Redis/SQLite storages?
	}

	get(namespace: string, persist: Persistence): Gateway {
		const cached = this.#gateways.get(namespace);
		if (cached !== undefined && cached[0] === persist) return cached[1];

		const storage = this.#storage(namespace, persist);
		const gateway = new this.gatewayClass(storage, defaultClock);
		this.#gateways.set(namespace, [persist, gateway]);
		return gateway;
	}
}
