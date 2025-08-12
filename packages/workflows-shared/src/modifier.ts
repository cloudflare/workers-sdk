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

	async #getSleepStepDisableKey(step: StepSelector): Promise<string> {
		let count = 1;
		if (step.index) {
			count = step.index;
		}
		const sleepNameCountHash = await computeHash(step.name + count);

		return sleepNameCountHash;
	}

	async disableSleeps(steps?: StepSelector[]): Promise<void> {
		if (!steps) {
			await this.#state.storage.put("disableAllSleeps", true);
		} else {
			for (const step of steps) {
				const sleepDisableKey = await this.#getSleepStepDisableKey(step);
				await this.#state.storage.put(sleepDisableKey, true);
			}
		}
	}

	async mockStepResult(step: StepSelector, stepResult: unknown): Promise<void> {
		console.log("mocking step result");
		const valueKey = await this.#getStepCacheKey(step);
		await this.#state.storage.put(`replace-result-${valueKey}`, stepResult);
	}

	async mockStepImplementation(
		_step: StepSelector,
		_implementation: () => Promise<unknown>
	): Promise<void> {
		// TODO
		// can call the new implementation here and replace the step result - meh
		// ideally pass the implementation to context so it can race with timeout
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
