import { createNamespace } from "../../core/create-command";
import { d1MigrationsApplyCommand } from "./apply";
import { d1MigrationsCreateCommand } from "./create";
import { d1MigrationsListCommand } from "./list";

export const d1MigrationsNamespace = createNamespace({
	metadata: {
		description: "Interact with D1 migrations",
		status: "stable",
		owner: "Product: D1",
	},
});

export {
	d1MigrationsApplyCommand,
	d1MigrationsCreateCommand,
	d1MigrationsListCommand,
};
