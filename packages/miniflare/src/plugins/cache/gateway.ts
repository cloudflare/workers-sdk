import { Clock } from "../../shared";
import { Storage } from "../../storage";

export class CacheGateway {
	constructor(
		private readonly storage: Storage,
		private readonly clock: Clock
	) {}

	async match(key: string) {
		throw new Error("Not yet implemented!");
	}

	async put(key: string, value: Uint8Array) {
		throw new Error("Not yet implemented!");
	}

	async delete(key: string) {
		throw new Error("Not yet implemented!");
	}
}
