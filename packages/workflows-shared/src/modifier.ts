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

	public async disableSleeps(steps?: StepSelector[]): Promise<void> {
		if (!steps) {
			console.log("[Modifier.disableSleeps()] Disabling all sleeps");
			await this.#state.storage.put("disableAllSleeps", true);
		} else {
			for (const step of steps) {
				console.log(
					"[Modifier.disableSleeps()] Disabling sleep of step:",
					step.name
				);
				const sleepDisableKey = await this.#getSleepStepDisableKey(step);
				await this.#state.storage.put(sleepDisableKey, true);
			}
		}
	}

	public async mockStepResult(
		step: StepSelector,
		stepResult: unknown
	): Promise<void> {
		console.log(
			"[Modifier.mockStepResult()] Mocking step result of step:",
			step.name
		);
		const valueKey = await this.#getStepCacheKey(step);
		await this.#state.storage.put(`replace-result-${valueKey}`, stepResult);
	}

	public async mockStepImplementation(
		_step: StepSelector,
		_implementation: () => Promise<unknown>
	): Promise<void> {
		// TODO
		// somehow pass the implementation to context so it can race with timeout
	}

	public async mockStepError(
		step: StepSelector,
		error: Error,
		times?: number
	): Promise<void> {
		console.log(
			"[Modifier.mockStepError()] Mocking step error of step",
			step.name
		);
		const valueKey = await this.#getStepCacheKey(step);
		const serializableError = {
			name: error.name,
			message: error.message,
		};
		if (times) {
			for (let time = 1; time <= times; time++) {
				const mockErrorKey = `mock-error-${valueKey}-${time}`;
				await this.#state.storage.put(mockErrorKey, serializableError);
			}
		} else {
			const mockErrorKey = `mock-error-${valueKey}`;
			await this.#state.storage.put(mockErrorKey, serializableError);
		}
	}

	public async forceStepTimeout(step: StepSelector, times?: number) {
		const valueKey = await this.#getStepCacheKey(step);
		if (times) {
			for (let time = 1; time <= times; time++) {
				const forceStepTimeoutKey = `force-step-timeout-${valueKey}-${time}`;
				await this.#state.storage.put(forceStepTimeoutKey, true);
			}
		} else {
			const forceStepTimeoutKey = `force-step-timeout-${valueKey}`;
			await this.#state.storage.put(forceStepTimeoutKey, true);
		}
	}

	public async mockEvent(event: UserEvent): Promise<void> {
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

	public async forceEventTimeout(step: StepSelector): Promise<void> {
		const waitForEventKey = await this.#getWaitForEventCacheKey(step);
		await this.#state.storage.put(`forceEventTimeout-${waitForEventKey}`, true);
	}
}
