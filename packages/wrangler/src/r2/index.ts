import { createNamespace } from "../core/create-command";

export const r2Namespace = createNamespace({
	metadata: {
		description: "📦 Manage R2 buckets & objects",
		status: "stable",
		owner: "Product: R2",
		category: "Storage & databases",
	},
});
