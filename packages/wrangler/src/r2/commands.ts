import { defineNamespace } from "../core";
import "./object";
import "./bucket";
import "./sippy";
import "./notification";

defineNamespace({
	command: "wrangler r2",

	metadata: {
		description: "📦 Manage R2 buckets & objects",
		status: "stable",
		owner: "Product: R2",
	},
});
