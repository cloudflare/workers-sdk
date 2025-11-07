// Emulated Secret Store Binding

import { WorkerEntrypoint } from "cloudflare:workers";

import { ADMIN_API } from "./constants";

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

	[ADMIN_API]() {
		return {
			create: async (value: string) => {
				const id = crypto.randomUUID().replaceAll("-", "");
				await this.env.store.put(this.env.secret_name, value, {
					metadata: { uuid: id },
				});
				return id;
			},
			update: async (value: string, id: string) => {
				const { keys } = await this.env.store.list<{ uuid: string }>();
				const secret = keys.find((k) => k.metadata?.uuid === id);
				if (!secret) {
					throw new Error(`Secret not found`);
				}
				await this.env.store.put(secret?.name, value, {
					metadata: { uuid: id },
				});
				return id;
			},
			duplicate: async (id: string, newName: string) => {
				const { keys } = await this.env.store.list<{ uuid: string }>();
				const secret = keys.find((k) => k.metadata?.uuid === id);
				if (!secret) {
					throw new Error(`Secret not found`);
				}
				const existingValue = await this.env.store.get(secret.name);
				if (!existingValue) {
					throw new Error(`Secret not found`);
				}
				const newId = crypto.randomUUID();
				await this.env.store.put(newName, existingValue, {
					metadata: { uuid: newId },
				});
				return newId;
			},
			delete: async (id: string) => {
				const { keys } = await this.env.store.list<{ uuid: string }>();
				const secret = keys.find((k) => k.metadata?.uuid === id);
				if (!secret) {
					throw new Error(`Secret not found`);
				}
				await this.env.store.delete(secret?.name);
			},
			list: async () => {
				const { keys } = await this.env.store.list<{ uuid: string }>();
				return keys;
			},
			get: async (id: string) => {
				const { keys } = await this.env.store.list<{ uuid: string }>();
				const secret = keys.find((k) => k.metadata?.uuid === id);
				if (!secret) {
					throw new Error(`Secret not found`);
				}
				return secret.name;
			},
		};
	}
}
