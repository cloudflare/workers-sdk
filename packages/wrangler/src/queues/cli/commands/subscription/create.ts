import { createCommand } from "../../../../core/create-command";
import { UserError } from "../../../../errors";
import { logger } from "../../../../logger";
import { createEventSubscription } from "../../../client";
import {
	EVENT_SOURCE_TYPES,
	EventSourceType,
} from "../../../subscription-types";
import type {
	CreateEventSubscriptionRequest,
	EventSource,
} from "../../../subscription-types";

function parseSourceArgument(
	source: string,
	args: {
		modelName?: string;
		workerName?: string;
		workflowName?: string;
	}
): EventSource {
	switch (source as EventSourceType) {
		case EventSourceType.KV:
			return { type: EventSourceType.KV };

		case EventSourceType.R2:
			return { type: EventSourceType.R2 };

		case EventSourceType.SUPER_SLURPER:
			return { type: EventSourceType.SUPER_SLURPER };

		case EventSourceType.VECTORIZE:
			return { type: EventSourceType.VECTORIZE };

		case EventSourceType.WORKERS_AI_MODEL:
			if (!args.modelName) {
				throw new UserError(
					`--model-name is required when using source '${EventSourceType.WORKERS_AI_MODEL}'`
				);
			}
			return {
				type: EventSourceType.WORKERS_AI_MODEL,
				model_name: args.modelName,
			};

		case EventSourceType.WORKERS_BUILDS_WORKER:
			if (!args.workerName) {
				throw new UserError(
					`--worker-name is required when using source '${EventSourceType.WORKERS_BUILDS_WORKER}'`
				);
			}
			return {
				type: EventSourceType.WORKERS_BUILDS_WORKER,
				worker_name: args.workerName,
			};

		case EventSourceType.WORKFLOWS_WORKFLOW:
			if (!args.workflowName) {
				throw new UserError(
					`--workflow-name is required when using source '${EventSourceType.WORKFLOWS_WORKFLOW}'`
				);
			}
			return {
				type: EventSourceType.WORKFLOWS_WORKFLOW,
				workflow_name: args.workflowName,
			};

		default:
			throw new UserError(
				`Unknown source type: ${source}. Supported sources: ${EVENT_SOURCE_TYPES.join(", ")}`
			);
	}
}

export const queuesSubscriptionCreateCommand = createCommand({
	metadata: {
		description: "Create a new event subscription for a queue",
		owner: "Product: Queues",
		status: "stable",
	},
	positionalArgs: ["queue"],
	args: {
		queue: {
			describe: "The name of the queue to create the subscription for",
			type: "string",
			demandOption: true,
		},
		source: {
			describe: "The event source type",
			type: "string",
			demandOption: true,
			choices: EVENT_SOURCE_TYPES,
		},
		events: {
			describe: "Comma-separated list of event types to subscribe to",
			type: "string",
			demandOption: true,
		},
		name: {
			describe: "Name for the subscription (auto-generated if not provided)",
			type: "string",
		},
		enabled: {
			describe: "Whether the subscription should be active",
			type: "boolean",
			default: true,
		},
		"model-name": {
			describe: "Workers AI model name (required for workersAi.model source)",
			type: "string",
		},
		"worker-name": {
			describe: "Worker name (required for workersBuilds.worker source)",
			type: "string",
		},
		"workflow-name": {
			describe: "Workflow name (required for workflows.workflow source)",
			type: "string",
		},
	},
	async handler(args, { config }) {
		const source = parseSourceArgument(args.source, {
			modelName: args.modelName,
			workerName: args.workerName,
			workflowName: args.workflowName,
		});

		const events = args.events
			.split(",")
			.map((event) => event.trim())
			.filter(Boolean);

		if (events.length === 0) {
			throw new UserError(
				"No events specified. Use --events to provide a comma-separated list of event types to subscribe to. For a complete list of sources and corresponding events, please refer to: https://developers.cloudflare.com/queues/event-subscriptions/events-schemas/"
			);
		}

		const request: CreateEventSubscriptionRequest = {
			name: args.name || `${args.queue} ${args.source}`,
			enabled: args.enabled,
			source,
			destination: {
				type: "queues.queue",
				queue_id: "",
			},
			events,
		};

		logger.log(`Creating event subscription for queue '${args.queue}'...`);

		const subscription = await createEventSubscription(
			config,
			args.queue,
			request
		);

		logger.log(
			`✨ Successfully created event subscription '${subscription.name}' with id '${subscription.id}'.`
		);
	},
});
