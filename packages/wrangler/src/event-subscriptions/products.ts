import assert from "node:assert";
import { CommandLineArgsError } from "../errors";
import type {
	EventHubProductId,
	EventHubProductSpec,
	EventHubSource,
} from "./types";

export type EventSubscription = {
	id: string;
	created_at: Date;
	modified_at: Date;
	name: string;
	enabled: boolean;
	source:
		| { service: "superSlurper" }
		| { service: "workflows"; workflow_name: string }
		| { service: "workersAI"; model: string }
		| { service: "workersBuilds"; script: string };
	destination: { service: "queues"; queue_id: string };
	events: string[];
};

/**
 * Every product that the Event Hub supports is exported as a key from this function.
 * Within each product, the `validate` / `format` functions allow teams to perform
 * transformations between what the user types in as the source and what we send
 * to the API.
 * So for example, workers AI might want users to express the source as
 * `--source=workersAi.<modelName>`, but then send `{ service: 'workersAi', account: "", modelName: "" }`
 * to the API to create a subscription (as an example)
 * This allows us to have a pretty API, but also not force users to type in things
 * we can infer.
 */
export const products = (
	_accountTag: string
): Record<EventHubProductId, EventHubProductSpec<EventHubSource>> => ({
	superSlurper: {
		validate: (source) => {
			assert(source === "superSlurper");
			return { service: "superSlurper" };
		},
		format: ({ service }) => {
			assert(service === "superSlurper");
			return service;
		},
	},
	workersAI: {
		validate: (source) => {
			const [service, model] = source.split(".");
			assert(service === "workersAI");

			if (!model) {
				throw new CommandLineArgsError(
					`Invalid source. Must be formatted as workersAI.<model>`
				);
			}

			return { service, model };
		},
		format: (source) => {
			assert(source.service === "workersAI");
			return `workersAI.${source.model}`;
		},
	},
	workersBuilds: {
		validate: (source) => {
			const [service, script] = source.split(".");
			assert(service === "workersBuilds");

			if (!script) {
				throw new CommandLineArgsError(
					`Invalid source. Must be formatted as workersBuilds.<script_name>`
				);
			}

			return { service, script };
		},
		format: (source) => {
			assert(source.service === "workersBuilds");
			return `workersBuilds.${source.script}`;
		},
	},
	workflows: {
		validate: (source) => {
			const [service, workflowName] = source.split(".");
			assert(service === "workflows");

			if (!workflowName) {
				throw new CommandLineArgsError(
					`Invalid source. Must be formatted as workflows.<workflow_id>`
				);
			}

			return { service, workflow_name: workflowName };
		},
		format: (source) => {
			assert(source.service === "workflows");
			return `workflows.${source.workflow_name}`;
		},
	},
});
