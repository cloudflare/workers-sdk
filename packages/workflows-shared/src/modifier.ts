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

export class WorkflowInstanceModifier extends RpcTarget {
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

	#getAndIncrementCounter = async (valueKey: string, by: number) => {
		const counterKey = `failure-index-${valueKey}`;
		const next = (await this.#state.storage.get<number>(counterKey)) ?? 1;
		await this.#state.storage.put(counterKey, next + by);
		return next;
	};

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

	// step.do() flow: It first checks if a result or error is already in the cache and, if so, returns it immediately.
	// If nothing is in the cache, it checks for remaining attempts and runs the user's code against the defined timeout.
	// Since `step.do()` performs this initial cache check, directly changing the `valueKey` would cause it to
	// assume the value was pre-cached, preventing it from writing any logs about the step's execution state.
	// Storing the value under a separate key is crucial because it ensures all execution logs for the step are
	// generated, rather than the step being skipped due to a premature cache hit.
	async mockStepResult(step: StepSelector, stepResult: unknown): Promise<void> {
		const valueKey = await this.#getStepCacheKey(step);

		if (await this.#state.storage.get(`replace-result-${valueKey}`)) {
			throw new Error(
				`[WorkflowIntrospector] Trying to mock step '${step.name}' multiple times!`
			);
		}

		await this.#state.storage.put(`replace-result-${valueKey}`, stepResult);
	}

	// Same logic of `mockStepResult` but stores an error instead of a value.
	async mockStepError(
		step: StepSelector,
		error: Error,
		times?: number
	): Promise<void> {
		const valueKey = await this.#getStepCacheKey(step);
		const serializableError = {
			name: error.name,
			message: error.message,
		};

		if (await this.#state.storage.get(`replace-result-${valueKey}`)) {
			throw new Error(
				`[WorkflowIntrospector] Trying to mock error on step '${step.name}' after mocking its result!`
			);
		}

		if (times) {
			const start = await this.#getAndIncrementCounter(valueKey, times);
			const mockErrorsPuts = Array.from({ length: times }, (_, i) => {
				const attempt = start + i;
				const mockErrorKey = `mock-step-error-${valueKey}-${attempt}`;
				return this.#state.storage.put(mockErrorKey, serializableError);
			});

			await Promise.all(mockErrorsPuts);
		} else {
			const mockErrorKey = `mock-step-error-${valueKey}`;
			await this.#state.storage.put(mockErrorKey, serializableError);
		}
	}

	async forceStepTimeout(step: StepSelector, times?: number) {
		const valueKey = await this.#getStepCacheKey(step);

		if (await this.#state.storage.get(`replace-result-${valueKey}`)) {
			throw new Error(
				`[WorkflowIntrospector] Trying to force timeout on step '${step.name}' after mocking its result!`
			);
		}

		if (times) {
			const start = await this.#getAndIncrementCounter(valueKey, times);
			const forceTimeouts = Array.from({ length: times }, (_, i) => {
				const attempt = start + i;
				const forceStepTimeoutKey = `force-step-timeout-${valueKey}-${attempt}`;
				return this.#state.storage.put(forceStepTimeoutKey, true);
			});

			await Promise.all(forceTimeouts);
		} else {
			const forceStepTimeoutKey = `force-step-timeout-${valueKey}`;
			await this.#state.storage.put(forceStepTimeoutKey, true);
		}
	}

	async mockEvent(event: UserEvent): Promise<void> {
		const myEvent: Event = {
			timestamp: new Date(),
			payload: event.payload,
			type: event.type,
		};

		await this.#state.storage.put(`mock-event-${event.type}`, true);
		await this.#engine.receiveEvent(myEvent);
	}

	async forceEventTimeout(step: StepSelector): Promise<void> {
		const waitForEventKey = await this.#getWaitForEventCacheKey(step);
		await this.#state.storage.put(
			`force-event-timeout-${waitForEventKey}`,
			true
		);
	}
}
