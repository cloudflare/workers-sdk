import {
	DurableObject,
	Workflow as WorkflowEntrypoint,
	WorkflowStep,
} from "cloudflare:workers";
import { Context } from "./context";
import {
	INSTANCE_METADATA,
	InstanceEvent,
	InstanceLogsResponse,
	InstanceMetadata,
	InstanceStatus,
	InstanceTrigger,
	RawInstanceLog,
} from "./instance";
import {
	ENGINE_TIMEOUT,
	GracePeriodSemaphore,
	startGracePeriod,
} from "./lib/gracePeriodSemaphore";
import { TimePriorityQueue } from "./lib/timePriorityQueue";

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

	readLogsFromStep(cacheKey: string): RawInstanceLog[] {
		return [];
	}

	readLogs(): InstanceLogsResponse {
		// TODO: Verify
		throw new Error("Not required for local dev");
	}

	async getStatus(
		accountId: number,
		instanceId: string
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

	async abort(reason: string) {
		// TODO: Maybe don't actually kill but instead check a flag and return early if true
	}

	async userTriggeredTerminate() {}

	async init(
		accountId: number,
		workflow: DatabaseWorkflow,
		version: DatabaseVersion,
		instance: DatabaseInstance,
		event: {
			timestamp: Date;
			payload: Record<string, unknown>;
		}
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

		// const accountStubId = this.env.ACCOUNTS.idFromName(accountId.toString());
		// const accountStub = this.env.ACCOUNTS.get(accountStubId);

		// using accountMetadata = await accountStub.getMetadata();

		// assert(accountMetadata, "Account metadata was undefined");

		const stubStep = new Context(this, this.ctx);

		// let target = this.env.DISPATCHER.get(
		// 	version.mutable_pipeline_id,
		// 	{
		// 		// class name in the script, if no classes
		// 		// are exported in the script, it triggers the default
		// 		// export
		// 		entrypoint: version.class_name,
		// 	},
		// 	{
		// 		ownership: {
		// 			ownerId: accountId,
		// 			zoneId: accountMetadata.zone_id,
		// 			zoneName: `${accountMetadata.zone_name}.workers.dev`,
		// 		},
		// 	}
		// );

		// With class_name we have three cases, that we need to support in testing (to effectively mock the dynamic dispatcher):
		//  - The class_name was set (different than empty string) so the module exports a object with a class_name field
		//  - The class_name wasn't set (export default, equal to empty string) but it also exports other stuff - the module exports a object with a default field
		//	- The class_name wasn't set and it doesn't export anything but the default class - we can use it directly (we already supported this)

		// if (this.env.ENVIRONMENT == "testing") {
		// 	// For local tests, the wrapped binding is powered by RPC which requires use of promises
		// 	// if (target instanceof Promise) target = await target;
		// 	if (version.class_name != "") {
		// 		//FIXME (lduarte): types
		// 		// @ts-expect-error WorkflowStub types are wrong
		// 		target = target[version.class_name];
		// 	} else {
		// 		if (Object.hasOwnProperty.call(target, "default")) {
		// 			// @ts-expect-error WorkflowStub types are wrong
		// 			target = target["default"];
		// 		}
		// 	}
		// }

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
			// TODO: Trigger user script via binding
			const target = this.env.USER_WORKFLOW;
			const result = await target.run([event], stubStep as WorkflowStep);
			// Since this gets written to sql as a JSON string, this will need
			// to implement toJSON()
			// That is different from step return values that only need to
			// implement structuredClone because that allows v8 serialization
			// We aren't sure at the moment what the right thing to do here is
			// since the latter might not be human readable so perhaps JSON
			// is the way to go?
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
			// TODO: Handle user errors differently from system errors
			let error;
			if (err instanceof Error) {
				error = {
					// TODO (WOR-79): Stacks are all incorrect over RPC and need work
					// stack: err.stack,
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
