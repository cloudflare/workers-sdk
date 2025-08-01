import { RpcTarget } from "cloudflare:workers";
import { computeHash } from "./lib/cache";

export type StepSelector = {
	name: string;
	index?: number;
};

export class InstanceModifier extends RpcTarget {
	#state: DurableObjectState;

	constructor(state: DurableObjectState) {
		super();
		this.#state = state;
	}

	async disableSleeps(): Promise<void> {
		await this.#state.storage.put("disableSleeps", true);
	}

	async forceEventTimeout(step: StepSelector): Promise<void> {
		let count = 1;
		if (step.index) {
			count = step.index;
		}
		const name = `${step.name}-${count}`;
		const hash = await computeHash(name);
		const cacheKey = `${hash}-${count}`;
		const waitForEventKey = `${cacheKey}-value`;
		await this.#state.storage.put(`forceEventTimeout-${waitForEventKey}`, true);
	}
}
