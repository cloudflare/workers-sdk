// Emulated Hello World Binding

import { WorkerEntrypoint } from "cloudflare:workers";

import type { HelloWorldObject } from "./object.worker";

// ENV configuration
interface Env {
	config: { enable_timer?: boolean };
	store: DurableObjectNamespace<HelloWorldObject>;
}

export class HelloWorldBinding extends WorkerEntrypoint<Env> {
	async get(): Promise<{ value: string; ms?: number }> {
		const objectNamespace = this.env.store;
		const namespaceId = JSON.stringify(this.env.config);
		const id = objectNamespace.idFromName(namespaceId);
		const stub = objectNamespace.get(id);
		const value = await stub.get();
		return {
			value: value ?? "",
			ms: this.env.config.enable_timer ? 100 : undefined,
		};
	}

	async set(value: string): Promise<void> {
		const objectNamespace = this.env.store;
		const namespaceId = JSON.stringify(this.env.config);
		const id = objectNamespace.idFromName(namespaceId);
		const stub = objectNamespace.get(id);
		await stub.set(value);
	}
}
