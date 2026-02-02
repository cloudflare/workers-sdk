import { createNamespace } from "../../../../core/create-command";

export const pipelinesSinksNamespace = createNamespace({
	metadata: {
		description: "Manage sinks for pipelines",
		owner: "Product: Pipelines",
		status: "open beta",
	},
});
