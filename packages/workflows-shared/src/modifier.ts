import { RpcTarget } from "cloudflare:workers";

export class InstanceModifier extends RpcTarget {
	#storage: DurableObjectStorage;

	constructor(storage: DurableObjectStorage) {
		super();
		this.#storage = storage;
	}

	async disableSleeps() {
		this.#storage.put("disableSleeps", true);
	}
}
