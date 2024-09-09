import type { ArgDefinition } from "./define-command";

export const json: Record<string, ArgDefinition> = {
	json: {
		describe: "Return output as clean JSON",
		type: "boolean",
		default: false,
	},
};
