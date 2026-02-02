import { createNamespace } from "../../../core/create-command";

export const d1MigrationsNamespace = createNamespace({
	metadata: {
		description: "Interact with D1 migrations",
		status: "stable",
		owner: "Product: D1",
	},
});
