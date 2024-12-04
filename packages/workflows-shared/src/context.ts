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
import { MAX_STEP_NAME_LENGTH, validateStepName } from "./lib/validators";
import type { Engine } from "./engine";
import type { InstanceMetadata } from "./instance";
import type {
	WorkflowSleepDuration,
	WorkflowStepConfig,
} from "cloudflare:workers";

export type ResolvedStepConfig = Required<WorkflowStepConfig>;

const defaultConfig: Required<WorkflowStepConfig> = {
	retries: {
		limit: 5,
		delay: 1000,
		backoff: "constant",
	},
	timeout: "15 minutes",
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

		if (!validateStepName(name)) {
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
		const stepNameWithCounter = `${name}-${count}`;
		const stepStateKey = `${cacheKey}-metadata`;

		const maybeMap = await this.#state.storage.get([valueKey, configKey]);

		// Check cache
		const maybeResult = maybeMap.get(valueKey);

		if (maybeResult) {
			// console.log(`Cache hit for ${cacheKey}`);
			return (maybeResult as { value: T }).value;
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
					const timeout = ms(config.timeout);
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

				result = await Promise.race([doWrapperClosure(), timeoutPromise()]);

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

				if (e instanceof Error && error.name === "NonRetryableError") {
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
					this.#engine.writeLog(InstanceEvent.WORKFLOW_FAILURE, null, null, {
						error: new WorkflowFatalError(
							`The execution of the Workflow instance was terminated, as the step "${name}" threw a NonRetryableError`
						),
					});

					await this.#engine.setStatus(
						accountId,
						instance.id,
						InstanceStatus.Errored
					);
					await this.#engine.timeoutHandler.release(this.#engine);
					return this.#engine.abort(`Step "${name}" threw a NonRetryableError`);
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
					this.#engine.writeLog(
						InstanceEvent.WORKFLOW_FAILURE,
						cacheKey,
						null,
						{}
					);
					await this.#engine.setStatus(
						accountId,
						instance.id,
						InstanceStatus.Errored
					);
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

		if (maybeResult != undefined) {
			// @ts-expect-error priorityQueue is initiated in init
			const entryPQ = this.#engine.priorityQueue.getFirst(
				(a) => a.hash === cacheKey && a.type === "sleep"
			);
			// in case the engine dies while sleeping and wakes up before the retry period
			if (entryPQ !== undefined) {
				await scheduler.wait(entryPQ.targetTimestamp - Date.now());
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
			targetTimestamp: Date.now() + duration,
			type: "sleep",
		});
		// this probably will never finish except if sleep is less than the grace period
		await scheduler.wait(duration);

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
}
