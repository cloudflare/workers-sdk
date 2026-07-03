import { getBindingLocalSupport } from "@cloudflare/workers-utils";
import type { Binding } from "@cloudflare/workers-utils";

/**
 * Filters a bindings record to only those that should be resolved remotely.
 *
 * A binding is picked when:
 *  - it explicitly opts in with `remote: true`, or
 *  - its type has no local simulator (e.g. ai, media, vpc_service), in which
 *    case it is always resolved remotely.
 */
export function pickRemoteBindings(
	bindings: Record<string, Binding>
): Record<string, Binding> {
	return Object.fromEntries(
		Object.entries(bindings ?? {}).filter(([, binding]) => {
			if (
				getBindingLocalSupport(binding.type) ===
				"DO-NOT-USE-this-resource-will-never-have-a-local-simulator"
			) {
				return true;
			}
			return "remote" in binding && binding["remote"];
		})
	);
}
