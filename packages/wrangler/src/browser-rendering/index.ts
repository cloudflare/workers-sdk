import { createNamespace } from "../core/create-command";

export const browserNamespace = createNamespace({
	metadata: {
		description: "🌐 Manage Browser Run sessions",
		status: "open beta",
		owner: "Product: Browser Run",
		category: "Compute & AI",
	},
});

export { browserCreateCommand } from "./create";
export { browserCloseCommand } from "./close";
export { browserListCommand } from "./list";
export { browserViewCommand } from "./view";
