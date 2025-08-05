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

	async #getStepCacheKey(step: StepSelector): Promise<string> {
		const hash = await computeHash(step.name);
		let count = 1;
		if (step.index) {
			count = step.index;
		}
		const cacheKey = `${hash}-${count}`;
		const valueKey = `${cacheKey}-value`;

		return valueKey;
	}

	async disableSleeps(): Promise<void> {
		await this.#state.storage.put("disableSleeps", true);
	}

	async mockStepResult(step: StepSelector, stepResult: unknown): Promise<void> {
		const valueKey = await this.#getStepCacheKey(step);
		await this.#state.storage.put(`replace-result-${valueKey}`, stepResult);
	}

	async mockEvent(event: UserEvent): Promise<void> {
		// could maybe:
		// WorkflowInstance.sendEvent()
		// Engine.receiveEvent()
		// flag with waitForEventKey

		const myEvent: Event = {
			timestamp: new Date(),
			payload: event.payload,
			type: event.type,
		};

		await this.#engine.receiveEvent(myEvent);
	}

	async forceEventTimeout(step: StepSelector): Promise<void> {
		const waitForEventKey = await this.#getWaitForEventCacheKey(step);
		await this.#state.storage.put(`forceEventTimeout-${waitForEventKey}`, true);
	}
}
