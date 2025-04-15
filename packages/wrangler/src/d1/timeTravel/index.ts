import { createNamespace } from "../../core/create-command";
import { d1TimeTravelInfoCommand } from "./info";
import { d1TimeTravelRestoreCommand } from "./restore";

export const d1TimeTravelNamespace = createNamespace({
	metadata: {
		description:
			"Use Time Travel to restore, fork or copy a database at a specific point-in-time",
		status: "stable",
		owner: "Product: D1",
	},
});

export { d1TimeTravelInfoCommand, d1TimeTravelRestoreCommand };
