import { createAlias, createNamespace } from "../core/create-command";

export const flagshipNamespace = createNamespace({
	metadata: {
		description: "🚩 Manage Flagship apps and feature flags",
		status: "open beta",
		owner: "Product: Flagship",
		category: "Compute & AI",
	},
});

export const flagshipAppsNamespace = createNamespace({
	metadata: {
		description: "Manage Flagship apps",
		status: "open beta",
		owner: "Product: Flagship",
	},
});

export const flagshipFlagsNamespace = createNamespace({
	metadata: {
		description: "Manage Flagship feature flags",
		status: "open beta",
		owner: "Product: Flagship",
	},
});

export const flagshipFlagsRulesNamespace = createNamespace({
	metadata: {
		description: "Manage targeting rules for a Flagship feature flag",
		status: "open beta",
		owner: "Product: Flagship",
	},
});

export const flagshipAppsListAlias = createAlias({
	aliasOf: "wrangler flagship apps list",
});

export const flagshipAppsDeleteAlias = createAlias({
	aliasOf: "wrangler flagship apps delete",
});

export const flagshipFlagsListAlias = createAlias({
	aliasOf: "wrangler flagship flags list",
});

export const flagshipFlagsGetAlias = createAlias({
	aliasOf: "wrangler flagship flags get",
});

export const flagshipFlagsDeleteAlias = createAlias({
	aliasOf: "wrangler flagship flags delete",
});

export const flagshipFlagsChangelogAlias = createAlias({
	aliasOf: "wrangler flagship flags changelog",
});

export const flagshipFlagsEvaluateAlias = createAlias({
	aliasOf: "wrangler flagship flags evaluate",
});
