import { defineNamespace } from "../core";
import "./list";
import "./info";
import "./insights";
import "./create";
import "./delete";
import "./backups";
import "./execute";
import "./export";
import "./timeTravel";
import "./migrations";

defineNamespace({
	command: "wrangler d1",

	metadata: {
		description: `🗄  Manage Workers D1 databases`,
		status: "stable",
		owner: "Product: D1",
	},
});
