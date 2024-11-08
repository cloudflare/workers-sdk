import { defineNamespace } from "../core";
import "./bucket";
import "./object";
import "./sippy";
import "./notification";
import "./domain";
import "./public-dev-url";

defineNamespace({
	command: "wrangler r2",
	metadata: {
		description: "📦 Manage R2 buckets & objects",
		status: "stable",
		owner: "Product: R2",
	},
});
