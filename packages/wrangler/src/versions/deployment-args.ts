import type { NamedArgDefinitions } from "../core/types";

export const durableObjectsHibernationTimeoutArg = {
	"durable-objects-hibernation-timeout": {
		describe:
			"Determines how long code updates will be delayed while awaiting a hibernation event for Durable Objects",
		type: "string",
		requiresArg: true,
		default: "5m",
	},
} as const satisfies NamedArgDefinitions;
