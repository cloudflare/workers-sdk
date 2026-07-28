import { z } from "zod";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

export const WorkflowsOptionsSchema = z.object({
	workflows: z
		.record(
			z.string(),
			z.object({
				name: z.string(),
				className: z.string(),
				scriptName: z.string().optional(),
				external: z.boolean().optional(),
				remoteProxyConnectionString: z
					.custom<RemoteProxyConnectionString>()
					.optional(),
				stepLimit: z.number().int().min(1).optional(),
				compatibilityFlags: z.string().array().optional(),
			})
		)
		.optional(),
});
export const WORKFLOWS_PLUGIN_NAME = "workflows";
export const WORKFLOWS_STORAGE_SERVICE_NAME = `${WORKFLOWS_PLUGIN_NAME}:storage`;

// NOTE(miniflare v5 options-schema migration): Workflows support is temporarily
// disabled. This plugin has been removed from the `PLUGINS` registry and
// neutralised to a no-op while the config schema migration lands. It must be
// re-implemented against the unified `ParsedWorkerOptions` shape (reading
// workflow definitions from the parsed config) in a follow-up phase. The
// previous implementation is preserved in git history.
export const WORKFLOWS_PLUGIN: Plugin = {
	bindingTypeDescription: "Workflow",
	getBindings() {
		return [];
	},
	getNodeBindings() {
		return {};
	},
	getServices() {
		return [];
	},
};
