import { getDoExportsEnabledFromEnv } from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import type { Config } from "./config";
import type { DurableObjectExport } from "./environment";

/**
 * Context label for the {@link assertDoExportsEnabledIfConfigured} helper.
 * Used to build a stable telemetry label so we can tell the deploy / dev /
 * types call sites apart.
 */
export type DoExportsOptInContext =
	| "deploy"
	| "versions upload"
	| "dev"
	| "types"
	| "vitest-pool-workers";

/**
 * If the user's config declares Durable Object `exports` entries but the
 * `X_DO_EXPORTS` environment variable is not set, throw a `UserError` so the
 * user discovers the missing opt-in locally before any side effects fire.
 *
 * Called from the deploy / versions-upload payload resolution (so the
 * declarative payload doesn't get silently downgraded to legacy `migrations`),
 * from the `wrangler dev` config-resolution path (so a local-dev session can't
 * drift from production semantics), from the `wrangler types` flow (so the
 * generated `.d.ts` surface can't drift either), and from
 * `@cloudflare/vitest-pool-workers` (so tests can't drift either).
 */
export function assertDoExportsEnabledIfConfigured(
	exports: Config["exports"] | undefined,
	context: DoExportsOptInContext
): void {
	if (!hasDurableObjectExports(exports)) {
		return;
	}
	if (getDoExportsEnabledFromEnv()) {
		return;
	}

	let telemetryMessage: string;
	switch (context) {
		case "deploy":
			telemetryMessage = "deploy do exports flag missing";
			break;
		case "versions upload":
			telemetryMessage = "versions upload do exports flag missing";
			break;
		case "dev":
			telemetryMessage = "dev do exports flag missing";
			break;
		case "types":
			telemetryMessage = "types do exports flag missing";
			break;
		case "vitest-pool-workers":
			telemetryMessage = "vitest-pool-workers do exports flag missing";
			break;
	}

	throw new UserError(
		"Your configuration declares Durable Object `exports` but the `X_DO_EXPORTS` environment variable is not set. Set `X_DO_EXPORTS=true` to enable the declarative exports flow, or remove the `exports` entries to fall back to `migrations`.",
		{ telemetryMessage }
	);
}

/**
 * Returns a map of exports that are only of type "durable-object".
 */
export function getDurableObjectExports(
	exports: Config["exports"] | undefined
): Record<string, DurableObjectExport> {
	if (exports === undefined) {
		return {};
	}

	return Object.fromEntries(
		Object.entries(exports).filter(
			([, entry]) => entry.type === "durable-object"
		)
	) as Record<string, DurableObjectExport>;
}

export function hasDurableObjectExports(
	exports: Config["exports"] | undefined
): boolean {
	return Object.keys(getDurableObjectExports(exports)).length > 0;
}
