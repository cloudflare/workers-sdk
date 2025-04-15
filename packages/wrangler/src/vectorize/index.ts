import { vectorizeGABanner } from "./common";
import { createNamespace } from "../core/create-command";

export const vectorizeNamespace = createNamespace({
	metadata: {
		description: "🧮 Manage Vectorize indexes",
		status: "stable",
		owner: "Product: Vectorize",
		epilogue: vectorizeGABanner,
	},
});

export const vectorizeMetadataNamespace = createNamespace({
	metadata: {
		description: "Manage Vectorize metadata indexes",
		status: "stable",
		owner: "Product: Vectorize",
	},
});

// Export all vectorize commands
export { vectorizeCreateCommand } from "./create";
export { vectorizeDeleteCommand } from "./delete";
export { vectorizeGetCommand } from "./get";
export { vectorizeListCommand } from "./list";
export { vectorizeQueryCommand } from "./query";
