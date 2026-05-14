import type { StartDevWorkerInput } from "../api";
import type { CfScriptFormat } from "@cloudflare/workers-utils";

/**
 * Inject bindings into the Worker to support Workers Sites. These are injected at the last minute so that
 * they don't display in the output of `printBindings()`
 */
export function addWorkersSitesBindings(
	bindings: NonNullable<StartDevWorkerInput["bindings"]>,
	namespace: string | undefined,
	manifest:
		| {
				[filePath: string]: string;
		  }
		| undefined,
	format: CfScriptFormat
) {
	const withSites = { ...bindings };
	if (namespace) {
		withSites["__STATIC_CONTENT"] = {
			type: "kv_namespace",
			id: namespace,
		};
	}

	if (manifest && format === "service-worker") {
		withSites["__STATIC_CONTENT_MANIFEST"] = {
			type: "text_blob",
			source: { contents: "__STATIC_CONTENT_MANIFEST" },
		};
	}
	return withSites;
}

export function formatTime(duration: number) {
	return `(${(duration / 1000).toFixed(2)} sec)`;
}
