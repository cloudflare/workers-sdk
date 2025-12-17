import { DurableObject } from "cloudflare:workers";

export class Counter extends DurableObject {
	async getCounterValue() {
		const value = ((await this.ctx.storage.get("value")) as number) || 0;

		return value;
	}

	async increment(amount = 1) {
		let value = ((await this.ctx.storage.get("value")) as number) || 0;
		value += amount;
		await this.ctx.storage.put("value", value);

		return value;
	}
}
