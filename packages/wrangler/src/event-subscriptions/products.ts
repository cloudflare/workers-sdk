import assert from "node:assert";
import { CommandLineArgsError } from "../errors";

export type EventSubscription = {
	id: string;
	created_at: Date;
	modified_at: Date;
	name: string;
	enabled: boolean;
	source:
		| { service: "slurper" }
		| { service: "workflows"; workflow_name: string }
		| { service: "workersAI"; model: string }
		| { service: "workersBuilds"; script: string };
	destination: { service: "queues"; queue_id: string };
	events: string[];
};

export const products = (
	_accountTag: string
): Record<EventHubProductId, EventHubProductSpec<EventHubSource>> => ({
	slurper: {
		validate: (source) => {
			assert(source === "slurper");
			return { service: "slurper" };
		},
		format: ({ service }) => {
			assert(service === "slurper");
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

/////////////////////////////////////////
// No modifications beyond this please //
/////////////////////////////////////////

export type EventHubSource = EventSubscription["source"];
export type EventHubProductId = EventHubSource["service"];
export type EventHubProductSpec<S = EventHubSource> = {
	/**
	 * @argument source: The --source argument input by the user
	 *
	 * @returns The `source` property to send in the "Create Event Subscription"
	 * request. The expected shape is documented
	 * This is the same shape as the `source` Zod discriminated union you appended
	 * to when you onboarded your service schema in the Queues codebase.
	 */
	validate: (source: string) => S;
	/**
	 * @argument source: The `source` property from the Event Subscription
	 * response
	 *
	 * @returns A string that can be displayed to the user when listing
	 * subscriptions. This should generally be in the format <ProductID>.<ResourceID>
	 */
	format: (source: S) => string;
};
