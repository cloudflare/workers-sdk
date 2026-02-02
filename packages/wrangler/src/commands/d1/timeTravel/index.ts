import { createNamespace } from "../../../core/create-command";

export const d1TimeTravelNamespace = createNamespace({
	metadata: {
		description:
			"Use Time Travel to restore, fork or copy a database at a specific point-in-time",
		status: "stable",
		owner: "Product: D1",
	},
});
