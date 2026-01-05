import { createNamespace } from "../../../core/create-command";

export const pipelinesStreamsNamespace = createNamespace({
	metadata: {
		description: "Manage streams for pipelines",
		owner: "Product: Pipelines",
		status: "open beta",
	},
});
