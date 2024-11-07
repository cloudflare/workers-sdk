import { DurableObject } from "cloudflare:workers";
import { Context } from "./context";
import {
	INSTANCE_METADATA,
	InstanceEvent,
	InstanceStatus,
	InstanceTrigger,
} from "./instance";
import {
	ENGINE_TIMEOUT,
	GracePeriodSemaphore,
	startGracePeriod,
} from "./lib/gracePeriodSemaphore";
import { TimePriorityQueue } from "./lib/timePriorityQueue";
import type {
	InstanceLogsResponse,
	InstanceMetadata,
	RawInstanceLog,
} from "./instance";
import type { WorkflowEntrypoint, WorkflowEvent } from "cloudflare:workers";

export interface Env {
	USER_WORKFLOW: WorkflowEntrypoint;
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

export class Engine extends DurableObject<Env> {
	logs: Array<unknown> = [];
	status: InstanceStatus = InstanceStatus.Queued;

	isRunning: boolean = false;
	accountId: number | undefined;
	instanceId: string | undefined;
	workflowName: string | undefined;
	timeoutHandler: GracePeriodSemaphore;
	priorityQueue: TimePriorityQueue | undefined;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);

		void this.ctx.blockConcurrencyWhile(async () => {
			this.ctx.storage.transactionSync(() => {
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
                    )
                `);
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
		this.logs.push({
			event,
			group,
			target,
			metadata,
		});
	}

	readLogsFromStep(_cacheKey: string): RawInstanceLog[] {
		return [];
	}

	readLogs(): InstanceLogsResponse {
		return {
			// @ts-expect-error TODO: Fix this
			logs: this.logs,
		};
	}

	async getStatus(
		_accountId: number,
		_instanceId: string
	): Promise<InstanceStatus> {
		return this.status;
	}

	async setStatus(
		accountId: number,
		instanceId: string,
		status: InstanceStatus
	): Promise<void> {
		this.status = status;
	}

	async abort(_reason: string) {
		// TODO: Maybe don't actually kill but instead check a flag and return early if true
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
		this.priorityQueue.popPastEntries();
		await this.priorityQueue.handleNextAlarm();

		if (this.isRunning) {
			return;
		}

		// We are not running and are possibly starting a new lifetime
		this.accountId = accountId;
		this.instanceId = instance.id;
		this.workflowName = workflow.name;

		const status = await this.getStatus(accountId, instance.id);
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
