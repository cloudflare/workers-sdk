import { RpcTarget } from "cloudflare:workers";
import { computeHash } from "./lib/cache";
import type { Event } from "./context";
import type { Engine } from "./engine";

export type StepSelector = {
	name: string;
	index?: number;
};

type UserEvent = {
	type: string;
	payload: unknown;
};

export class InstanceModifier extends RpcTarget {
	#engine: Engine;
	#state: DurableObjectState;

	constructor(engine: Engine, state: DurableObjectState) {
		super();
		this.#engine = engine;
		this.#state = state;
	}

	async disableSleeps(): Promise<void> {
		await this.#state.storage.put("disableSleeps", true);
	}

	async mockEvent(event: UserEvent): Promise<void> {
		console.log("SENDING THE EVENT WITH TYPE", event.type);
		// could maybe:
		// WorkflowInstance.sendEvent()
		// Engine.receiveEvent()
		//const waitForEventKey = await this.#getWaitForEventCacheKey(step);

		const myEvent: Event = {
			timestamp: new Date(),
			payload: event.payload,
			type: event.type,
		};

		await this.#engine.receiveEvent(myEvent);
	}

	async #getWaitForEventCacheKey(step: StepSelector): Promise<string> {
		let count = 1;
		if (step.index) {
			count = step.index;
		}
		const name = `${step.name}-${count}`;
		const hash = await computeHash(name);
		const cacheKey = `${hash}-${count}`;
		const waitForEventKey = `${cacheKey}-value`;

		return waitForEventKey;
	}

	async forceEventTimeout(step: StepSelector): Promise<void> {
		const waitForEventKey = await this.#getWaitForEventCacheKey(step);
		await this.#state.storage.put(`forceEventTimeout-${waitForEventKey}`, true);
	}
}
