import { RpcTarget } from "cloudflare:workers";
import { ms } from "itty-time";
import { INSTANCE_METADATA, InstanceEvent, InstanceStatus } from "./instance";
import { computeHash } from "./lib/cache";
import {
	WorkflowFatalError,
	WorkflowInternalError,
	WorkflowTimeoutError,
} from "./lib/errors";
import { calcRetryDuration } from "./lib/retries";
import { isValidStepName, MAX_STEP_NAME_LENGTH } from "./lib/validators";
import type { Engine } from "./engine";
import type { InstanceMetadata } from "./instance";
import type {
	WorkflowSleepDuration,
	WorkflowStepConfig,
	WorkflowStepEvent,
} from "cloudflare:workers";

export type Event = {
	timestamp: Date;
	payload: unknown;
	type: string;
};

export type ResolvedStepConfig = Required<WorkflowStepConfig>;

const defaultConfig: Required<WorkflowStepConfig> = {
	retries: {
		limit: 5,
		delay: 1000,
		backoff: "exponential",
	},
	timeout: "10 minutes",
};

export interface UserErrorField {
	isUserError?: boolean;
}

export type StepState = {
	attemptedCount: number;
};

export class Context extends RpcTarget {
	#engine: Engine;
	#state: DurableObjectState;

	#counters: Map<string, number> = new Map();
	#lifetimeStepCounter: number = 0;

	constructor(engine: Engine, state: DurableObjectState) {
		super();
		this.#engine = engine;
		this.#state = state;
	}

	#getCount(name: string): number {
		let val = this.#counters.get(name) ?? 0;
		// 1-indexed, as we're increasing the value before write
		val++;
		this.#counters.set(name, val);

		return val;
	}

	do(name: string, callback: () => Promise<unknown>): Promise<unknown>;
	do(
		name: string,
		config: WorkflowStepConfig,
		callback: () => Promise<unknown>
	): Promise<unknown>;

	async do<T>(
		name: string,
		configOrCallback: WorkflowStepConfig | (() => Promise<T>),
		callback?: () => Promise<T>
	): Promise<unknown | void | undefined> {
		let closure, stepConfig;
		// If a user passes in a config, we'd like it to be the second arg so the callback is always last
		if (callback) {
			closure = callback;
			stepConfig = configOrCallback as WorkflowStepConfig;
		} else {
			closure = configOrCallback as () => Promise<T>;
			stepConfig = {};
		}

		this.#lifetimeStepCounter++;

		const stepLimit = this.#engine.stepLimit;
		if (this.#lifetimeStepCounter > stepLimit) {
			throw new WorkflowFatalError(
				`The limit of ${stepLimit} steps has been reached. This limit can be changed in your worker configuration.`
			);
		}

		if (!isValidStepName(name)) {
			// NOTE(lduarte): marking errors as user error allows the observability layer to avoid leaking
			// user errors to sentry while making everything more observable. `isUserError` is not serialized
			// into userland code due to how workerd serialzises errors over RPC - we also set it as undefined
			// in the obs layer in case changes to workerd happen
			const error = new WorkflowFatalError(
				`Step name "${name}" exceeds max length (${MAX_STEP_NAME_LENGTH} chars) or invalid characters found`
			) as Error & UserErrorField;
			error.isUserError = true;
			throw error;
		}

		let config: ResolvedStepConfig = {
			...defaultConfig,
			...stepConfig,
			retries: {
				...defaultConfig.retries,
				...stepConfig.retries,
			},
		};

		const hash = await computeHash(name);
		const count = this.#getCount("run-" + name);
		const cacheKey = `${hash}-${count}`;

		const valueKey = `${cacheKey}-value`;
		const configKey = `${cacheKey}-config`;
		const errorKey = `${cacheKey}-error`;
		const stepNameWithCounter = `${name}-${count}`;
		const stepStateKey = `${cacheKey}-metadata`;

		const maybeMap = await this.#state.storage.get([valueKey, configKey]);

		// Check cache
		const maybeResult = maybeMap.get(valueKey);

		if (maybeResult) {
			// console.log(`Cache hit for ${cacheKey}`);
			return (maybeResult as { value: T }).value;
		}

		const maybeError: (Error & UserErrorField) | undefined = maybeMap.get(
			errorKey
		) as Error | undefined;

		if (maybeError) {
			maybeError.isUserError = true;
			throw maybeError;
		}

		// Persist initial config because user can pass in dynamic config
		if (!maybeMap.has(configKey)) {
			await this.#state.storage.put(configKey, config);
		} else {
			config = maybeMap.get(configKey) as ResolvedStepConfig;
		}

		const attemptLogs = this.#engine
			.readLogsFromStep(cacheKey)
			.filter((val) =>
				[
					InstanceEvent.ATTEMPT_SUCCESS,
					InstanceEvent.ATTEMPT_FAILURE,
					InstanceEvent.ATTEMPT_START,
				].includes(val.event)
			);

		// this means that the the engine died while executing this step - we can mark the latest attempt as failed
		if (
			attemptLogs.length > 0 &&
			attemptLogs.at(-1)?.event === InstanceEvent.ATTEMPT_START
		) {
			// TODO: We should get this from SQL
			const stepState = ((await this.#state.storage.get(
				stepStateKey
			)) as StepState) ?? {
				attemptedCount: 1,
			};

			const priorityQueueHash = `${cacheKey}-${stepState.attemptedCount}`;

			// @ts-expect-error priorityQueue is initiated in init
			const timeoutEntryPQ = this.#engine.priorityQueue.getFirst(
				(a) => a.hash === priorityQueueHash && a.type === "timeout"
			);
			// if there's a timeout on the PQ we pop it, because we wont need it
			if (timeoutEntryPQ !== undefined) {
				// @ts-expect-error priorityQueue is initiated in init
				this.#engine.priorityQueue.remove(timeoutEntryPQ);
			}
			this.#engine.writeLog(
				InstanceEvent.ATTEMPT_FAILURE,
				cacheKey,
				stepNameWithCounter,
				{
					attempt: stepState.attemptedCount,
					error: {
						name: "WorkflowInternalError",
						message: `Attempt failed due to internal workflows error`,
					},
				}
			);

			await this.#state.storage.put(stepStateKey, stepState);
		}

		const doWrapper = async (
			doWrapperClosure: () => Promise<unknown>
		): Promise<unknown | void | undefined> => {
			const stepState = ((await this.#state.storage.get(
				stepStateKey
			)) as StepState) ?? {
				attemptedCount: 0,
			};
			await this.#engine.timeoutHandler.acquire(this.#engine);

			if (stepState.attemptedCount == 0) {
				this.#engine.writeLog(
					InstanceEvent.STEP_START,
					cacheKey,
					stepNameWithCounter,
					{
						config,
					}
				);
			} else {
				// in case the engine dies while retrying and wakes up before the retry period
				const priorityQueueHash = `${cacheKey}-${stepState.attemptedCount}`;
				// @ts-expect-error priorityQueue is initiated in init
				const retryEntryPQ = this.#engine.priorityQueue.getFirst(
					(a) => a.hash === priorityQueueHash && a.type === "retry"
				);
				// complete sleep if it didn't finish for some reason
				if (retryEntryPQ !== undefined) {
					await this.#engine.timeoutHandler.release(this.#engine);
					await scheduler.wait(retryEntryPQ.targetTimestamp - Date.now());
					await this.#engine.timeoutHandler.acquire(this.#engine);
					// @ts-expect-error priorityQueue is initiated in init
					this.#engine.priorityQueue.remove({
						hash: priorityQueueHash,
						type: "retry",
					});
				}
			}

			let result;

			const instanceMetadata =
				await this.#state.storage.get<InstanceMetadata>(INSTANCE_METADATA);
			if (!instanceMetadata) {
				throw new Error("instanceMetadata is undefined");
			}
			const { accountId, instance } = instanceMetadata;

			try {
				const timeoutPromise = async () => {
					const priorityQueueHash = `${cacheKey}-${stepState.attemptedCount}`;
					let timeout = ms(config.timeout);
					if (forceStepTimeout) {
						timeout = 0;
					}
					// @ts-expect-error priorityQueue is initiated in init
					await this.#engine.priorityQueue.add({
						hash: priorityQueueHash,
						targetTimestamp: Date.now() + timeout,
						type: "timeout",
					});
					await scheduler.wait(timeout);
					// if we reach here, means that we can try to delete the timeout from the PQ
					// because we managed to wait in the same lifetime
					// @ts-expect-error priorityQueue is initiated in init
					await this.#engine.priorityQueue.remove({
						hash: priorityQueueHash,
						type: "timeout",
					});
					throw new WorkflowTimeoutError(
						`Execution timed out after ${timeout}ms`
					);
				};

				this.#engine.writeLog(
					InstanceEvent.ATTEMPT_START,
					cacheKey,
					stepNameWithCounter,
					{
						attempt: stepState.attemptedCount + 1,
					}
				);
				stepState.attemptedCount++;
				await this.#state.storage.put(stepStateKey, stepState);
				const priorityQueueHash = `${cacheKey}-${stepState.attemptedCount}`;

				const mockErrorKey = `mock-step-error-${valueKey}`;
				const persistentMockError = await this.#state.storage.get<{
					name: string;
					message: string;
				}>(mockErrorKey);
				const transientMockError = await this.#state.storage.get<{
					name: string;
					message: string;
				}>(`${mockErrorKey}-${stepState.attemptedCount}`);
				const mockErrorPayload = persistentMockError || transientMockError;

				// if a mocked error exists, throw it immediately
				if (mockErrorPayload) {
					const errorToThrow = new Error(mockErrorPayload.message);
					errorToThrow.name = mockErrorPayload.name;
					throw errorToThrow;
				}

				const replaceResult = await this.#state.storage.get(
					`replace-result-${valueKey}`
				);

				const forceStepTimeoutKey = `force-step-timeout-${valueKey}`;
				const persistentStepTimeout =
					await this.#state.storage.get(forceStepTimeoutKey);
				const transientStepTimeout = await this.#state.storage.get(
					`${forceStepTimeoutKey}-${stepState.attemptedCount}`
				);
				const forceStepTimeout = persistentStepTimeout || transientStepTimeout;

				if (forceStepTimeout) {
					result = await timeoutPromise();
				} else if (replaceResult) {
					result = replaceResult;
					await this.#state.storage.delete(`replace-result-${valueKey}`);
					// if there is a timeout to be forced we dont want to race with closure
				} else {
					result = await Promise.race([doWrapperClosure(), timeoutPromise()]);
				}

				// if we reach here, means that the clouse ran successfully and we can remove the timeout from the PQ
				// @ts-expect-error priorityQueue is initiated in init
				await this.#engine.priorityQueue.remove({
					hash: priorityQueueHash,
					type: "timeout",
				});

				// We store the value of `output` in an object with a `value` property. This allows us to store `undefined`,
				// in the case that it's returned from the user's code. This is because DO storage will error if you try to
				// store undefined directly.
				try {
					await this.#state.storage.put(valueKey, { value: result });
				} catch (e) {
					// something that cannot be written to storage
					if (e instanceof Error && e.name === "DataCloneError") {
						this.#engine.writeLog(
							InstanceEvent.ATTEMPT_FAILURE,
							cacheKey,
							stepNameWithCounter,
							{
								attempt: stepState.attemptedCount,
								error: new WorkflowFatalError(
									`Value returned from step "${name}" is not serialisable`
								),
							}
						);
						this.#engine.writeLog(
							InstanceEvent.STEP_FAILURE,
							cacheKey,
							stepNameWithCounter,
							{}
						);
						this.#engine.writeLog(InstanceEvent.WORKFLOW_FAILURE, null, null, {
							error: new WorkflowFatalError(
								`The execution of the Workflow instance was terminated, as the step "${name}" returned a value which is not serialisable`
							),
						});

						await this.#engine.setStatus(
							accountId,
							instance.id,
							InstanceStatus.Errored
						);
						await this.#engine.timeoutHandler.release(this.#engine);
						await this.#engine.abort("Value is not serialisable");
					} else {
						// TODO (WOR-77): Send this to Sentry
						throw new WorkflowInternalError(
							`Storage failure for ${valueKey}: ${e} `
						);
					}
					return;
				}

				this.#engine.writeLog(
					InstanceEvent.ATTEMPT_SUCCESS,
					cacheKey,
					stepNameWithCounter,
					{
						attempt: stepState.attemptedCount,
					}
				);
			} catch (e) {
				const error = e as Error;
				// if we reach here, means that the clouse ran but errored out and we can remove the timeout from the PQ
				// @ts-expect-error priorityQueue is initiated in init
				this.#engine.priorityQueue.remove({
					hash: `${cacheKey}-${stepState.attemptedCount}`,
					type: "timeout",
				});

				if (
					e instanceof Error &&
					(error.name === "NonRetryableError" ||
						error.message.startsWith("NonRetryableError"))
				) {
					this.#engine.writeLog(
						InstanceEvent.ATTEMPT_FAILURE,
						cacheKey,
						stepNameWithCounter,
						{
							attempt: stepState.attemptedCount,
							error: new WorkflowFatalError(
								`Step threw a NonRetryableError with message "${e.message}"`
							),
						}
					);
					this.#engine.writeLog(
						InstanceEvent.STEP_FAILURE,
						cacheKey,
						stepNameWithCounter,
						{}
					);

					throw error;
				}

				this.#engine.writeLog(
					InstanceEvent.ATTEMPT_FAILURE,
					cacheKey,
					stepNameWithCounter,
					{
						attempt: stepState.attemptedCount,
						error: {
							name: error.name,
							message: error.message,
							// TODO (WOR-79): Stacks are all incorrect over RPC and need work
							// stack: error.stack,
						},
					}
				);

				await this.#state.storage.put(stepStateKey, stepState);

				if (stepState.attemptedCount <= config.retries.limit) {
					// TODO (WOR-71): Think through if every Error should transition
					const durationMs = calcRetryDuration(config, stepState);

					const priorityQueueHash = `${cacheKey}-${stepState.attemptedCount}`;
					// @ts-expect-error priorityQueue is initiated in init
					await this.#engine.priorityQueue.add({
						hash: priorityQueueHash,
						targetTimestamp: Date.now() + durationMs,
						type: "retry",
					});
					await this.#engine.timeoutHandler.release(this.#engine);
					// this may never finish because of the grace period - but waker will take of it
					await scheduler.wait(durationMs);

					// if it ever reaches here, we can try to remove it from the priority queue since it's no longer useful
					// @ts-expect-error priorityQueue is initiated in init
					this.#engine.priorityQueue.remove({
						hash: priorityQueueHash,
						type: "retry",
					});

					return doWrapper(doWrapperClosure);
				} else {
					await this.#engine.timeoutHandler.release(this.#engine);
					this.#engine.writeLog(
						InstanceEvent.STEP_FAILURE,
						cacheKey,
						stepNameWithCounter,
						{}
					);

					await this.#state.storage.put(errorKey, error);
					throw error;
				}
			}

			this.#engine.writeLog(
				InstanceEvent.STEP_SUCCESS,
				cacheKey,
				stepNameWithCounter,
				{
					// TODO (WOR-86): Add limits, figure out serialization
					result,
				}
			);
			await this.#engine.timeoutHandler.release(this.#engine);
			return result;
		};

		return doWrapper(closure);
	}

	async sleep(name: string, duration: WorkflowSleepDuration): Promise<void> {
		if (typeof duration == "string") {
			duration = ms(duration);
		}

		const hash = await computeHash(name + duration.toString());
		const count = this.#getCount("sleep-" + name + duration.toString());
		const cacheKey = `${hash}-${count}`;
		const sleepNameWithCounter = `${name}-${count}`;

		const sleepKey = `${cacheKey}-value`;
		const sleepLogWrittenKey = `${cacheKey}-log-written`;
		const maybeResult = await this.#state.storage.get(sleepKey);

		const sleepNameCountHash = await computeHash(
			name + this.#getCount("sleep-" + name)
		);
		const disableThisSleep = await this.#state.storage.get(sleepNameCountHash);
		const disableAllSleeps = await this.#state.storage.get("disableAllSleeps");

		const disableSleep = disableAllSleeps || disableThisSleep;

		if (maybeResult != undefined) {
			// @ts-expect-error priorityQueue is initiated in init
			const entryPQ = this.#engine.priorityQueue.getFirst(
				(a) => a.hash === cacheKey && a.type === "sleep"
			);
			// in case the engine dies while sleeping and wakes up before the retry period
			if (entryPQ !== undefined) {
				await scheduler.wait(
					disableSleep ? 0 : entryPQ.targetTimestamp - Date.now()
				);
				// @ts-expect-error priorityQueue is initiated in init
				this.#engine.priorityQueue.remove({ hash: cacheKey, type: "sleep" });
			}
			const shouldWriteLog =
				(await this.#state.storage.get(sleepLogWrittenKey)) == undefined;
			if (shouldWriteLog) {
				this.#engine.writeLog(
					InstanceEvent.SLEEP_COMPLETE,
					cacheKey,
					sleepNameWithCounter,
					{}
				);
				await this.#state.storage.put(sleepLogWrittenKey, true);
			}
			return;
		}

		this.#engine.writeLog(
			InstanceEvent.SLEEP_START,
			cacheKey,
			sleepNameWithCounter,
			{
				durationMs: duration,
			}
		);
		const instanceMetadata =
			await this.#state.storage.get<InstanceMetadata>(INSTANCE_METADATA);
		if (!instanceMetadata) {
			throw new Error("instanceMetadata is undefined");
		}

		// TODO(lduarte): not sure of this order of operations
		await this.#state.storage.put(sleepKey, true); // Any value will do for cache hit

		// @ts-expect-error priorityQueue is initiated in init
		await this.#engine.priorityQueue.add({
			hash: cacheKey,
			targetTimestamp: Date.now() + (disableSleep ? 0 : duration),
			type: "sleep",
		});

		// this probably will never finish except if sleep is less than the grace period
		await scheduler.wait(disableSleep ? 0 : duration);

		this.#engine.writeLog(
			InstanceEvent.SLEEP_COMPLETE,
			cacheKey,
			sleepNameWithCounter,
			{}
		);
		await this.#state.storage.put(sleepLogWrittenKey, true);

		// @ts-expect-error priorityQueue is initiated in init
		this.#engine.priorityQueue.remove({ hash: cacheKey, type: "sleep" });
	}

	async sleepUntil(name: string, timestamp: Date | number): Promise<void> {
		if (timestamp instanceof Date) {
			timestamp = timestamp.valueOf();
		}

		const now = Date.now();
		// timestamp needs to be in the future, throw if not
		if (timestamp < now) {
			throw new Error(
				"You can't sleep until a time in the past, time-traveler"
			);
		}

		return this.sleep(name, timestamp - now);
	}

	async waitForEvent<T>(
		name: string,
		options: {
			type: string;
			timeout?: string | number;
		}
	): Promise<WorkflowStepEvent<T>> {
		if (!options.timeout) {
			options.timeout = "24 hours";
		}

		const count = this.#getCount("waitForEvent-" + name);
		const waitForEventNameWithCounter = `${name}-${count}`;
		const hash = await computeHash(waitForEventNameWithCounter);
		const cacheKey = `${hash}-${count}`;
		const waitForEventKey = `${cacheKey}-value`;
		const errorKey = `${cacheKey}-error`;

		const pendingWaiterRegistered = `${cacheKey}-pending`;

		const timeoutError = new WorkflowTimeoutError(
			`Execution timed out after ${ms(options.timeout)}ms`
		) as Error & UserErrorField;

		const maybeResult = await this.#state.storage.get<Event>(waitForEventKey);

		if (maybeResult) {
			const shouldWriteLog =
				(await this.#state.storage.get(waitForEventKey)) == undefined;
			if (shouldWriteLog) {
				this.#engine.writeLog(
					InstanceEvent.WAIT_COMPLETE,
					cacheKey,
					waitForEventNameWithCounter,
					maybeResult
				);
			}
			return maybeResult as WorkflowStepEvent<T>;
		}
		const maybeError: (Error & UserErrorField) | undefined =
			(await this.#state.storage.get(errorKey)) as Error | undefined;

		if (maybeError) {
			maybeError.isUserError = true;
			throw maybeError;
		}

		const maybeRegistered = await this.#state.storage.get(
			pendingWaiterRegistered
		);

		if (!maybeRegistered) {
			this.#engine.writeLog(
				InstanceEvent.WAIT_START,
				cacheKey,
				waitForEventNameWithCounter,
				{
					event: options.type,
				}
			);

			await this.#state.storage.put(pendingWaiterRegistered, true);
		}

		// if there's a timeout on the PQ we pop it, because we wont need it
		// @ts-expect-error priorityQueue is initiated in init
		const timeoutEntryPQ = this.#engine.priorityQueue.getFirst(
			(a) => a.hash === cacheKey && a.type === "timeout"
		);
		const forceEventTimeout = await this.#state.storage.get(
			`force-event-timeout-${waitForEventKey}`
		);
		if (
			(timeoutEntryPQ === undefined &&
				this.#engine.priorityQueue !== undefined &&
				this.#engine.priorityQueue.checkIfExistedInPast({
					hash: cacheKey,
					type: "timeout",
				})) ||
			(timeoutEntryPQ !== undefined &&
				timeoutEntryPQ.targetTimestamp < Date.now()) ||
			forceEventTimeout
		) {
			this.#engine.writeLog(
				InstanceEvent.WAIT_TIMED_OUT,
				cacheKey,
				waitForEventNameWithCounter,
				{
					name: timeoutError.name,
					message: timeoutError.message,
				}
			);
			await this.#state.storage.put(errorKey, timeoutError);
			throw timeoutError;
		}

		const timeoutPromise = async (timeoutToWait: number, addToPQ: boolean) => {
			const priorityQueueHash = cacheKey;
			if (addToPQ) {
				// @ts-expect-error priorityQueue is initiated in init
				await this.#engine.priorityQueue.add({
					hash: priorityQueueHash,
					targetTimestamp: Date.now() + timeoutToWait,
					type: "timeout",
				});
			}
			await scheduler.wait(timeoutToWait);
			// if we reach here, means that we can try to delete the timeout from the PQ
			// because we managed to wait in the same lifetime

			// @ts-expect-error priorityQueue is initiated in init
			this.#engine.priorityQueue.remove({
				hash: priorityQueueHash,
				type: "timeout",
			});
			// NOTE(lduarte): marking errors as user error allows the observability layer to avoid leaking
			// user errors to sentry while making everything more observable. `isUserError` is not serialized
			// into userland code due to how workerd serialzises errors over RPC - we also set it as undefined
			// in the obs layer in case changes to workerd happen
			const error = timeoutError;
			error.isUserError = true;
			throw error;
		};

		const eventPromise = new Promise<Event>((resolve) => {
			// TODO: This might need to be the name, not the event type

			const eventTypeQueue = this.#engine.eventMap.get(options.type);
			if (eventTypeQueue) {
				const event = eventTypeQueue.shift();
				if (event) {
					this.#engine.eventMap.set(options.type, eventTypeQueue);
					return resolve(event);
				}
			}
			const callbacks = this.#engine.waiters.get(options.type) ?? [];
			callbacks.push(resolve);

			this.#engine.waiters.set(options.type, callbacks);
		});

		const result = await Promise.race([
			eventPromise,
			timeoutEntryPQ !== undefined
				? timeoutPromise(timeoutEntryPQ.targetTimestamp - Date.now(), false)
				: timeoutPromise(ms(options.timeout), true),
		])
			.then(async (event) => {
				this.#engine.writeLog(
					InstanceEvent.WAIT_COMPLETE,
					cacheKey,
					waitForEventNameWithCounter,
					event as Event
				);
				await this.#state.storage.put(waitForEventKey, event);
				return event;
			})
			.catch(async (error) => {
				this.#engine.writeLog(
					InstanceEvent.WAIT_TIMED_OUT,
					cacheKey,
					waitForEventNameWithCounter,
					error
				);
				await this.#state.storage.put(errorKey, error);
				throw error;
			});

		return result as WorkflowStepEvent<T>;
	}
}
