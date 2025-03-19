// Emulated Secret Store Binding

import { WorkerEntrypoint } from "cloudflare:workers";
import { WRITE_SECRET } from "./constants";

// ENV configuration
interface Env {
	store: KVNamespace<string>;
	secret_name: string;
}

export class SecretsStoreSecret extends WorkerEntrypoint<Env> {
	async get(): Promise<string> {
		const value = await this.env.store.get(this.env.secret_name, "text");

		if (value === null) {
			throw new Error(`Secret "${this.env.secret_name}" not found`);
		}

		return value;
	}

	[WRITE_SECRET](value: string) {
		return this.env.store.put(this.env.secret_name, value);
	}
}
