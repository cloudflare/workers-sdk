import { Clock } from "../../shared";
import { Storage } from "../../storage";

export class CacheGateway {
	constructor(
		private readonly storage: Storage,
		private readonly clock: Clock
	) {}

	async match(_key: string) {
		throw new Error("Not yet implemented!");
	}

	async put(_key: string, _value: Uint8Array) {
		throw new Error("Not yet implemented!");
	}

	async delete(_key: string) {
		throw new Error("Not yet implemented!");
	}
}
