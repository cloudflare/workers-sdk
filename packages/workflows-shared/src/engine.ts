import { DurableObject } from "cloudflare:workers";
import { Context } from "./context";
import {
	INSTANCE_METADATA,
	InstanceEvent,
	InstanceStatus,
	instanceStatusName,
	InstanceTrigger,
	toInstanceStatus,
} from "./instance";
import { computeHash } from "./lib/cache";
import { WorkflowFatalError } from "./lib/errors";
import {
	ENGINE_TIMEOUT,
	GracePeriodSemaphore,
	startGracePeriod,
} from "./lib/gracePeriodSemaphore";
import { TimePriorityQueue } from "./lib/timePriorityQueue";
import { WorkflowInstanceModifier } from "./modifier";
import type { Event } from "./context";
import type { InstanceMetadata, RawInstanceLog } from "./instance";
import type { WorkflowEntrypoint, WorkflowEvent } from "cloudflare:workers";

interface Env {
	USER_WORKFLOW: WorkflowEntrypoint;
	STEP_LIMIT?: string; // JSON-encoded number from miniflare binding
}

export type DatabaseWorkflow = {
	name: string;
	id: string;
	created_on: string;
	modified_on: string;
	script_name: string;
	class_name: string | null;
	triggered_on: string | null;
};

export type DatabaseVersion = {
	id: string;
	class_name: string;
	created_on: string;
	modified_on: string;
	workflow_id: string;
	mutable_pipeline_id: string;
	step_limit?: number;
};

export type DatabaseInstance = {
	id: string;
	created_on: string;
	modified_on: string;
	workflow_id: string;
	version_id: string;
	status: InstanceStatus;
	started_on: string | null;
	ended_on: string | null;
};

export type Log = {
	event: InstanceEvent;
	group: string | null;
	target: string | null;
	metadata: {
		result: string;
		payload: string;
		error: { name: string; message: string };
	};
};

export type EngineLogs = {
	logs: Log[];
};

const ENGINE_STATUS_KEY = "ENGINE_STATUS";

const EVENT_MAP_PREFIX = "EVENT_MAP";

export const DEFAULT_STEP_LIMIT = 10_000;

export class Engine extends DurableObject<Env> {
	logs: Array<unknown> = [];

	isRunning: boolean = false;
	accountId: number | undefined;
	instanceId: string | undefined;
	workflowName: string | undefined;
	timeoutHandler: GracePeriodSemaphore;
	priorityQueue: TimePriorityQueue | undefined;
	stepLimit: number;

	waiters: Map<string, Array<(event: Event | PromiseLike<Event>) => void>> =
		new Map();
	eventMap: Map<string, Array<Event>> = new Map();

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);

		this.stepLimit = env.STEP_LIMIT
			? JSON.parse(env.STEP_LIMIT)
			: DEFAULT_STEP_LIMIT;

		void this.ctx.blockConcurrencyWhile(async () => {
			this.ctx.storage.transactionSync(() => {
				try {
					this.ctx.storage.sql.exec(`
						CREATE TABLE IF NOT EXISTS priority_queue (
							id INTEGER PRIMARY KEY NOT NULL,
							created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
							target_timestamp INTEGER NOT NULL,
							action INTEGER NOT NULL, -- should only be 0 or 1 (1 for added, 0 for deleted),
							entryType INTEGER NOT NULL,
							hash TEXT NOT NULL,
							CHECK (action IN (0, 1)), -- guararentee that action can only be 0 or 1
							UNIQUE (action, entryType, hash)
						);
						CREATE TABLE IF NOT EXISTS states (
							id INTEGER PRIMARY KEY NOT NULL,
							groupKey TEXT,
							target TEXT,
							metadata TEXT,
							event INTEGER NOT NULL
						)
					`);
				} catch (e) {
					console.error(e);
					throw e;
				}
			});
		});

		this.timeoutHandler = new GracePeriodSemaphore(
			startGracePeriod,
			ENGINE_TIMEOUT
		);
	}

	writeLog(
		event: InstanceEvent,
		group: string | null,
		target: string | null = null,
		metadata: Record<string, unknown>
	) {
		this.ctx.storage.sql.exec(
			"INSERT INTO states (event, groupKey, target, metadata) VALUES (?, ?, ?, ?)",
			event,
			group,
			target,
			JSON.stringify(metadata)
		);

		// Wake any waiters if this is a terminal step event
		if (group) {
			this.handleStepResultWaiter(group, event, metadata);
		}
	}

	readLogsFromStep(_cacheKey: string): RawInstanceLog[] {
		return [];
	}

	readLogs(): EngineLogs {
		const logs = [
			...this.ctx.storage.sql.exec<{
				event: InstanceEvent;
				groupKey: string | null;
				target: string | null;
				metadata: string;
			}>("SELECT event, groupKey, target, metadata FROM states"),
		];

		return {
			logs: logs.map((log) => ({
				...log,
				metadata: JSON.parse(log.metadata),
				group: log.groupKey,
			})),
		};
	}

	readLogsFromEvent(eventType: InstanceEvent): EngineLogs {
		const logs = [
			...this.ctx.storage.sql.exec<{
				event: InstanceEvent;
				groupKey: string | null;
				target: string | null;
				metadata: string;
			}>(
				"SELECT event, groupKey, target, metadata FROM states WHERE event = ?",
				eventType
			),
		];

		return {
			logs: logs.map((log) => ({
				...log,
				metadata: JSON.parse(log.metadata),
				group: log.groupKey,
			})),
		};
	}

	async getStatus(): Promise<InstanceStatus> {
		if (this.accountId === undefined) {
			// Engine could have restarted, so we try to restore from its state
			const metadata =
				await this.ctx.storage.get<InstanceMetadata>(INSTANCE_METADATA);
			if (metadata === undefined) {
				// metadata was never set, so we assume the engine was never started
				throw new Error("Engine was never started");
			}

			this.accountId = metadata.accountId;
			this.instanceId = metadata.instance.id;
			this.workflowName = metadata.workflow.name;
		}

		const res = await this.ctx.storage.get<InstanceStatus>(ENGINE_STATUS_KEY);

		// NOTE(lduarte): if status don't exist, means that engine is running for the first time, so we assume queued
		if (res === undefined) {
			return InstanceStatus.Queued;
		}
		return res;
	}

	async setStatus(
		accountId: number,
		instanceId: string,
		status: InstanceStatus
	): Promise<void> {
		await this.ctx.storage.put(ENGINE_STATUS_KEY, status);

		// check if anyone is waiting for this status
		this.handleStatusWaiter(status);
	}

	private statusWaiters: Map<
		InstanceStatus,
		{ resolve: () => void; reject: (e: unknown) => void }
	> = new Map();
	async waitForStatus(status: string): Promise<void> {
		const targetStatus = toInstanceStatus(status);
		const currentStatus =
			await this.ctx.storage.get<InstanceStatus>(ENGINE_STATUS_KEY);

		// if the workflow has already reached the desired state, resolve immediately
		if (currentStatus === targetStatus) {
			return;
		}

		// if it hasn't reached the desired state, create a new promise and add its resolver to the waiters map
		return new Promise((resolve, reject) => {
			this.statusWaiters.set(targetStatus, { resolve, reject });
			// immediately reconcile against current status in case it's already finite
			this.handleStatusWaiter(currentStatus as InstanceStatus);
		});
	}

	handleStatusWaiter(status: InstanceStatus): void {
		const waiter = this.statusWaiters.get(status);

		// resolve if it reached the desired status
		if (waiter) {
			waiter.resolve();
			this.statusWaiters.delete(status);
			return;
		}

		switch (status) {
			case InstanceStatus.Errored: {
				// if it reaches final status "errored", then it can't be waiting for it to complete or terminate
				const unreachableStatuses = [
					InstanceStatus.Complete,
					InstanceStatus.Terminated,
				];

				this.rejectUnreachableStatus(status, unreachableStatuses);
				break;
			}
			case InstanceStatus.Terminated: {
				// if it reaches final status "terminated", then it can't be waiting for it to complete or error
				const unreachableStatuses = [
					InstanceStatus.Complete,
					InstanceStatus.Errored,
				];

				this.rejectUnreachableStatus(status, unreachableStatuses);
				break;
			}
			case InstanceStatus.Complete: {
				// if it reaches final status "complete", then it can't be waiting for it to terminate or error
				const unreachableStatuses = [
					InstanceStatus.Terminated,
					InstanceStatus.Errored,
				];

				this.rejectUnreachableStatus(status, unreachableStatuses);
				break;
			}
			default:
				break;
		}
	}

	rejectUnreachableStatus(
		reachedStatus: number,
		unreachableStatuses: number[]
	): void {
		if (unreachableStatuses) {
			for (const unreachableStatus of unreachableStatuses) {
				const waiter = this.statusWaiters.get(unreachableStatus);
				if (waiter) {
					waiter.reject(
						new Error(
							`[WorkflowIntrospector] The Workflow instance ${this.instanceId} has reached status '${instanceStatusName(reachedStatus)}'. This is a finite status that prevents it from ever reaching the expected status of '${instanceStatusName(unreachableStatus)}'.`
						)
					);
					this.statusWaiters.delete(unreachableStatus);
					return;
				}
			}
		}
	}

	private stepResultWaiters: Map<
		string,
		{ resolve: (v: unknown) => void; reject: (e: unknown) => void }
	> = new Map();
	async waitForStepResult(
		stepName: string,
		stepCount?: number
	): Promise<unknown> {
		const hash = await computeHash(stepName);
		const count = stepCount ?? 1;
		const cacheKey = `${hash}-${count}`;

		// read latest log from step
		const rows = [
			...this.ctx.storage.sql.exec<{
				event: InstanceEvent;
				metadata: string;
			}>(
				"SELECT event, metadata FROM states WHERE groupKey = ? ORDER BY id DESC LIMIT 1",
				cacheKey
			),
		];

		if (rows.length > 0) {
			const { event, metadata } = rows[0];
			const parsed = JSON.parse(metadata);
			if (event === InstanceEvent.STEP_SUCCESS) {
				return parsed?.result;
			}
			if (event === InstanceEvent.STEP_FAILURE) {
				throw parsed?.error ?? parsed;
			}
		}

		// if it hasn't completed the step, create a new promise to later resolve/reject
		return new Promise<unknown>((resolve, reject) => {
			this.stepResultWaiters.set(cacheKey, { resolve, reject });
		});
	}

	handleStepResultWaiter(
		group: string,
		event: InstanceEvent,
		metadata: Record<string, unknown>
	) {
		const waiter = this.stepResultWaiters.get(group);
		if (!waiter) {
			return;
		}
		if (event === InstanceEvent.STEP_SUCCESS) {
			const result = metadata?.result;
			waiter.resolve(result);
			this.stepResultWaiters.delete(group);
		} else if (event === InstanceEvent.STEP_FAILURE) {
			const error = metadata?.error ?? new Error("Step failed");
			waiter.reject(error);
			this.stepResultWaiters.delete(group);
		}
	}

	async getOutputOrError(isOutput: boolean): Promise<unknown> {
		const status = await this.getStatus();

		if (isOutput) {
			if (status !== InstanceStatus.Complete) {
				throw new Error(
					`Cannot retrieve output: Workflow instance is in status "${instanceStatusName(status)}" but must be "complete" to have an output available`
				);
			}
			const logs = this.readLogsFromEvent(InstanceEvent.WORKFLOW_SUCCESS).logs;
			return logs.at(0)?.metadata.result;
		} else {
			if (status !== InstanceStatus.Errored) {
				throw new Error(
					`Cannot retrieve error: Workflow instance is in status "${instanceStatusName(status)}" but must be "errored" to have error information available`
				);
			}
			const logs = this.readLogsFromEvent(InstanceEvent.WORKFLOW_FAILURE).logs;
			const log = logs.at(0);
			if (!log?.metadata.error) {
				throw new Error(
					"Cannot retrieve error: No workflow instance failure log found"
				);
			}
			return log.metadata.error;
		}
	}

	async abort(_reason: string) {
		// TODO: Maybe don't actually kill but instead check a flag and return early if true
	}

	// Called by the dispose function when introspecting the instance in tests
	// TODO: Ideally this abort should be done by `abortAllDurableObjects` from worked called by vitest-pool-workers
	async unsafeAbort(reason?: string) {
		await this.ctx.storage.sync();
		await this.ctx.storage.deleteAll();

		this.ctx.abort(reason);
	}

	async storeEventMap() {
		// TODO: this can be more efficient, but oh well
		await this.ctx.blockConcurrencyWhile(async () => {
			for (const [key, value] of this.eventMap.entries()) {
				for (const eventIdx in value) {
					await this.ctx.storage.put(
						`${EVENT_MAP_PREFIX}\n${key}\n${eventIdx}`,
						value[eventIdx]
					);
				}
			}
		});
	}

	async restoreEventMap() {
		await this.ctx.blockConcurrencyWhile(async () => {
			// FIXME(lduarte): can this OoM the DO in the production?
			const entries = await this.ctx.storage.list<Event>({
				prefix: EVENT_MAP_PREFIX,
			});
			for (const [key, value] of entries) {
				const [_, eventType, _idx] = key.split("\n");
				// NOTE(lduarte): safe to do because list returns keys in ascending order, so
				// indexes will be correctly ordered
				const eventList = this.eventMap.get(eventType) ?? [];
				eventList.push(value);
				this.eventMap.set(eventType, eventList);
			}
		});
	}

	async receiveEvent(event: {
		timestamp: Date;
		payload: unknown;
		type: string;
	}) {
		// Always queue the event first
		// TODO: Persist it across lifetimes
		// There are four possible cases here:
		// - There is a callback waiting, send it
		// - There is no callback waiting but engine is alive, store it
		// - Engine is not awake and is in Waiting status, store it and start it up
		// - Engine is not awake and is in Paused (or another terminal) status, store it
		// - Engine is not awake and is Errored or Terminated, this should not get called
		let eventTypeQueue = this.eventMap.get(event.type) ?? [];
		eventTypeQueue.push(event as Event);
		await this.storeEventMap();
		// TODO: persist eventMap - it can be over 2MiB
		this.eventMap.set(event.type, eventTypeQueue);

		// if the engine is running
		if (this.isRunning) {
			// Attempt to get the callback and run it
			const callbacks = this.waiters.get(event.type);
			if (callbacks) {
				const callback = callbacks[0];
				if (callback) {
					callback(event);
					// Remove it from the list of callbacks
					callbacks.shift();
					this.waiters.set(event.type, callbacks);

					eventTypeQueue = this.eventMap.get(event.type) ?? [];
					eventTypeQueue.shift();
					this.eventMap.set(event.type, eventTypeQueue);

					return;
				}
			}
		} else {
			const mockEvent = await this.ctx.storage.get(`mock-event-${event.type}`);
			if (mockEvent) {
				return;
			}

			const metadata =
				await this.ctx.storage.get<InstanceMetadata>(INSTANCE_METADATA);

			if (metadata === undefined) {
				throw new Error("Engine was never started");
			}

			void this.init(
				metadata.accountId,
				metadata.workflow,
				metadata.version,
				metadata.instance,
				metadata.event
			);
		}
	}

	getInstanceModifier(): WorkflowInstanceModifier {
		return new WorkflowInstanceModifier(this, this.ctx);
	}

	async userTriggeredTerminate() {}

	async init(
		accountId: number,
		workflow: DatabaseWorkflow,
		version: DatabaseVersion,
		instance: DatabaseInstance,
		event: WorkflowEvent<unknown>
	) {
		if (this.priorityQueue === undefined) {
			this.priorityQueue = new TimePriorityQueue(
				this.ctx,
				// this.env,
				{
					accountId,
					workflow,
					version,
					instance,
					event,
				}
			);
		}

		if (this.isRunning) {
			return;
		}

		this.priorityQueue.popPastEntries();
		await this.priorityQueue.handleNextAlarm();

		// We are not running and are possibly starting a new lifetime
		this.accountId = accountId;
		this.instanceId = instance.id;
		this.workflowName = workflow.name;

		const status = await this.getStatus();
		if (
			[
				InstanceStatus.Errored, // TODO (WOR-85): Remove this once upgrade story is done
				InstanceStatus.Terminated,
				InstanceStatus.Complete,
			].includes(status)
		) {
			return;
		}

		if ((await this.ctx.storage.get(INSTANCE_METADATA)) == undefined) {
			const instanceMetadata: InstanceMetadata = {
				accountId,
				workflow,
				version,
				instance,
				event,
			};
			await this.ctx.storage.put(INSTANCE_METADATA, instanceMetadata);

			// TODO (WOR-78): We currently don't have a queue mechanism
			// WORKFLOW_QUEUED should happen before engine is spun up
			this.writeLog(InstanceEvent.WORKFLOW_QUEUED, null, null, {
				params: event.payload,
				versionId: version.id,
				trigger: {
					source: InstanceTrigger.API,
				},
			});
			this.writeLog(InstanceEvent.WORKFLOW_START, null, null, {});
		}

		// restore eventMap so that waitForEvent across lifetimes works correctly
		await this.restoreEventMap();

		const stubStep = new Context(this, this.ctx);

		const workflowRunningHandler = async () => {
			await this.ctx.storage.transaction(async () => {
				// manually start the grace period
				// startGracePeriod(this, this.timeoutHandler.timeoutMs);
				await this.setStatus(accountId, instance.id, InstanceStatus.Running);
			});
		};
		this.isRunning = true;

		void workflowRunningHandler();
		try {
			const target = this.env.USER_WORKFLOW;
			const result = await target.run(event, stubStep);
			this.writeLog(InstanceEvent.WORKFLOW_SUCCESS, null, null, {
				result,
			});
			// NOTE(lduarte): we want to run this in a transaction to guarentee ordering with running setstatus call
			// in case that it returns immediately
			await this.ctx.storage.transaction(async () => {
				await this.setStatus(accountId, instance.id, InstanceStatus.Complete);
			});
			this.isRunning = false;
		} catch (err) {
			let error;
			if (err instanceof Error) {
				if (
					err.name === "NonRetryableError" ||
					err.message.startsWith("NonRetryableError")
				) {
					this.writeLog(InstanceEvent.WORKFLOW_FAILURE, null, null, {
						error: new WorkflowFatalError(
							`The execution of the Workflow instance was terminated, as a step threw an NonRetryableError and it was not handled`
						),
					});

					await this.setStatus(accountId, instance.id, InstanceStatus.Errored);
					await this.abort(`A step threw a NonRetryableError`);
					this.isRunning = false;
					return;
				}
				error = {
					message: err.message,
					name: err.name,
				};
			} else {
				error = {
					name: "Error",
					message: err,
				};
			}

			this.writeLog(InstanceEvent.WORKFLOW_FAILURE, null, null, {
				error,
			});
			// NOTE(lduarte): we want to run this in a transaction to guarentee ordering with running setstatus call
			// in case that it throws immediately
			await this.ctx.storage.transaction(async () => {
				await this.setStatus(accountId, instance.id, InstanceStatus.Errored);
			});
			this.isRunning = false;
		}

		return {
			id: instance.id,
		};
	}
}
