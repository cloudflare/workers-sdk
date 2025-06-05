import { DurableObject } from "cloudflare:workers";

export class HelloWorldObject extends DurableObject {
	async get() {
		return await this.ctx.storage.get<string>("value");
	}

	async set(value: string) {
		await this.ctx.storage.put<string>("value", value);
	}
}
