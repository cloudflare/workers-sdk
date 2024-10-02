import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import type {
	InstanceEvent,
	InstanceLogsResponse,
	InstanceStatus,
	RawInstanceLog,
} from "./instance";
import type { GracePeriodSemaphore } from "./lib/gracePeriodSemaphore";
import type { TimePriorityQueue } from "./lib/timePriorityQueue";

export interface Env {
	INSTANCES: DurableObjectNamespace<Engine>;
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

export class Engine extends DurableObject<Env> {
	logs: Array<unknown>;

	isRunning: boolean = false;
	accountId: number | undefined;
	instanceId: string | undefined;
	workflowName: string | undefined;
	timeoutHandler: GracePeriodSemaphore;
	priorityQueue: TimePriorityQueue | undefined;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
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

	readLogsFromStep(cacheKey: string): RawInstanceLog[] {}

	readLogs(): InstanceLogsResponse {}

	async getStatus(
		accountId: number,
		instanceId: string
	): Promise<InstanceStatus> {}

	async setStatus(
		accountId: number,
		instanceId: string,
		status: InstanceStatus
	): Promise<void> {}

	async abort(reason: string) {
		// TODO: Maybe don't actually kill but instead check a flag and return early if true
	}

	async userTriggeredTerminate() {}

	async init(
		accountId: number,
		workflow: DatabaseWorkflow,
		version: DatabaseVersion,
		instance: Instance,
		event: {
			timestamp: Date;
			payload: Record<string, unknown>;
		}
	) {
		// TODO: Trigger user script via binding
	}
}
