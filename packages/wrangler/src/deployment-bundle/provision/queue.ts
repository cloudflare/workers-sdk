import { createQueue, listQueues } from "../../queues/client";
import { ProvisionResourceHandler } from "./index";
import type { Binding } from "../../api/startDevWorker/types";
import type {
	NormalisedResourceInfo,
	ProvisionableBinding,
	Settings,
} from "./index";
import type { Config } from "@cloudflare/workers-utils";

type QueueBinding = Extract<Binding, { type: "queue" }>;

export class QueueHandler extends ProvisionResourceHandler<
	"queue",
	QueueBinding
> {
	static readonly bindingType = "queue";
	static readonly friendlyName = "Queue";

	static async load(
		config: Config,
		_accountId: string
	): Promise<NormalisedResourceInfo[]> {
		const preExisting = await listQueues(config);
		return preExisting.map((q) => ({
			title: q.queue_name,
			value: q.queue_name,
		}));
	}

	static create(
		bindingName: string,
		binding: ProvisionableBinding,
		config: Config,
		accountId: string
	) {
		return new QueueHandler(
			bindingName,
			binding as QueueBinding,
			config,
			accountId
		);
	}

	get name(): string | undefined {
		return typeof this.binding.queue_name === "string"
			? this.binding.queue_name
			: undefined;
	}
	async create(name: string) {
		const result = await createQueue(this.config, { queue_name: name });
		return result.queue_name;
	}
	constructor(
		bindingName: string,
		binding: QueueBinding,
		config: Config,
		accountId: string
	) {
		super("queue", bindingName, binding, "queue_name", config, accountId);
	}

	isFullySpecified(): boolean {
		return (
			typeof this.binding.queue_name === "string" &&
			this.binding.queue_name.length > 0
		);
	}

	canInherit(settings: Settings | undefined): boolean {
		return !!settings?.bindings.find(
			(existing) =>
				existing.type === this.type &&
				existing.name === this.bindingName &&
				(this.binding.queue_name
					? this.binding.queue_name === existing.queue_name
					: true)
		);
	}

	async isConnectedToExistingResource(): Promise<boolean> {
		if (
			typeof this.binding.queue_name === "symbol" ||
			!this.binding.queue_name
		) {
			return false;
		}
		const queues = await listQueues(
			this.config,
			undefined,
			this.binding.queue_name
		);
		return queues.some((q) => q.queue_name === this.binding.queue_name);
	}

	get ciSafe(): boolean {
		return true;
	}
	get provisioningHint(): undefined {
		return undefined;
	}
}
