import { createNamespace } from "../core/create-command";

export const secretsStoreNamespace = createNamespace({
	metadata: {
		description: `🔐 Manage the Secrets Store`,
		status: "alpha",
		owner: "Product: SSL",
	},
});

export const secretsStoreStoreNamespace = createNamespace({
	metadata: {
		description: "🔐 Manage Stores within the Secrets Store",
		status: "alpha",
		owner: "Product: SSL",
	},
});

export const secretsStoreSecretNamespace = createNamespace({
	metadata: {
		description: "🔐 Manage Secrets within the Secrets Store",
		status: "alpha",
		owner: "Product: SSL",
	},
});
