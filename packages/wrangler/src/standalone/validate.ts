import { getStandaloneSupport } from "@cloudflare/workers-utils";
import { convertConfigBindingsToStartWorkerBindings } from "../api/startDevWorker";
import type { Config } from "@cloudflare/workers-utils";

export interface StandaloneBindingIssue {
	name: string;
	type: string;
}

/**
 * Returns the bindings configured for `config` that are not yet supported by a
 * standalone, self-hosted `workerd` runtime. Shared by `wrangler compile`
 * (which errors) and `wrangler dev` (which warns) so both apply the same rules.
 */
export function getStandaloneBindingIssues(
	config: Config
): StandaloneBindingIssue[] {
	const bindings = convertConfigBindingsToStartWorkerBindings(config) ?? {};
	const issues: StandaloneBindingIssue[] = [];
	for (const [name, binding] of Object.entries(bindings)) {
		if (getStandaloneSupport(binding.type) === "unsupported") {
			issues.push({ name, type: binding.type });
		}
	}
	return issues;
}

export function formatStandaloneBindingIssues(
	issues: StandaloneBindingIssue[]
): string {
	return issues.map((issue) => `  - ${issue.name} (${issue.type})`).join("\n");
}
