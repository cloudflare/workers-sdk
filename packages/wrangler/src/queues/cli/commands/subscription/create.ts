import { createCommand } from "../../../../core/create-command";
import { UserError } from "../../../../errors";
import { logger } from "../../../../logger";
import { createEventSubscription } from "../../../client";
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
	switch (source) {
		case "kv":
			return { type: "kv" };

		case "r2":
			return { type: "r2" };

		case "superSlurper":
			return { type: "superSlurper" };

		case "vectorize":
			return { type: "vectorize" };

		case "workersAi.model":
			if (!args.modelName) {
				throw new UserError(
					"--model-name is required when using source 'workersAi.model'"
				);
			}
			return {
				type: "workersAi.model",
				model_name: args.modelName,
			};

		case "workersBuilds.worker":
			if (!args.workerName) {
				throw new UserError(
					"--worker-name is required when using source 'workersBuilds.worker'"
				);
			}
			return {
				type: "workersBuilds.worker",
				worker_name: args.workerName,
			};

		case "workflows.workflow":
			if (!args.workflowName) {
				throw new UserError(
					"--workflow-name is required when using source 'workflows.workflow'"
				);
			}
			return {
				type: "workflows.workflow",
				workflow_name: args.workflowName,
			};

		default:
			throw new UserError(
				`Unknown source type: ${source}. Supported sources: kv, r2, superSlurper, vectorize, workersAi.model, workersBuilds.worker, workflows.workflow`
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
			choices: [
				"kv",
				"r2",
				"superSlurper",
				"vectorize",
				"workersAi.model",
				"workersBuilds.worker",
				"workflows.workflow",
			],
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
			throw new UserError("At least one event must be specified");
		}

		const request: CreateEventSubscriptionRequest = {
			name: args.name || `${args.queue} ${args.source} subscription`,
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
			`✨ Successfully created event subscription '${subscription.name}' (${subscription.id}).`
		);
	},
});
