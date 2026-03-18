import type { Binding } from "@cloudflare/workers-utils";

/**
 * Filters a bindings record to only those that should be resolved remotely.
 *
 * Bindings with `remote: true` are included, as are binding types that are
 * always remote (ai, media, vpc_service).
 */
export function pickRemoteBindings(
	bindings: Record<string, Binding>
): Record<string, Binding> {
	return Object.fromEntries(
		Object.entries(bindings ?? {}).filter(([, binding]) => {
			if (binding.type === "ai" || binding.type === "media") {
				// AI and media bindings are always remote
				return true;
			}

			if (binding.type === "vpc_service") {
				// VPC Service is always remote
				return true;
			}

			return "remote" in binding && binding["remote"];
		})
	);
}
