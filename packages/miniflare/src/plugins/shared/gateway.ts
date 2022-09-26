import path from "path";
import { fileURLToPath } from "url";
import { Clock, Storage, defaultClock, sanitisePath } from "@miniflare/shared";
import { FileStorage } from "@miniflare/storage-file";
import { MemoryStorage } from "@miniflare/storage-memory";
import { z } from "zod";
import { MiniflareCoreError } from "../../helpers";

// TODO: explain why persist passed as header, want options set to be atomic,
//  if set gateway before script update, may be using new persist before new script
export const PersistenceSchema = z.boolean().or(z.string()).optional();
export type Persistence = z.infer<typeof PersistenceSchema>;

export interface GatewayConstructor<Gateway> {
	new (storage: Storage, clock: Clock): Gateway;
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
		private readonly pluginName: string,
		private readonly gatewayClass: GatewayConstructor<Gateway>
	) {}

	#storage(namespace: string, persist: Persistence): Storage {
		// If persistence is disabled, use memory storage
		if (persist === undefined || persist === false) {
			let storage = this.#memoryStorages.get(namespace);
			if (storage !== undefined) return storage;
			this.#memoryStorages.set(namespace, (storage = new MemoryStorage()));
			return storage;
		}

		// Sanitise namespace to make it file-system safe
		const sanitisedNamespace = sanitisePath(namespace);

		// Try parse `persist` as a URL
		const url = maybeParseURL(persist);
		if (url !== undefined) {
			if (url.protocol === "file:") {
				const root = path.join(fileURLToPath(url), sanitisedNamespace);
				const unsanitise =
					url.searchParams.get(PARAM_FILE_UNSANITISE) === "true";
				return new FileStorage(root, !unsanitise);
			}
			// TODO: support Redis/SQLite storages?
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
		return new FileStorage(root);
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
