import { createNamespace } from "../core/create-command";
import { vectorizeGABanner } from "./common";

export const vectorizeNamespace = createNamespace({
	metadata: {
		description: "🧮 Manage Vectorize indexes",
		status: "open-beta",
		owner: "Product: Vectorize",
		epilogue: vectorizeGABanner,
	},
});

export const vectorizeMetadataNamespace = createNamespace({
	metadata: {
		description: "Manage Vectorize metadata indexes",
		status: "open-beta",
		owner: "Product: Vectorize",
	},
});
