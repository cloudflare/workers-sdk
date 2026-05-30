import { createOAuthFlow } from "@cloudflare/workers-auth";
import { purgeConfigCaches } from "../config-cache";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import openInBrowser from "../open-in-browser";
import { generateAuthUrl } from "./generate-auth-url";
import { generateRandomState } from "./generate-random-state";
import { getAuthFromEnv } from "./user";

/**
 * The single wrangler-wide OAuth flow instance.
 *
 * Wires the OAuth-flow primitives in `@cloudflare/workers-auth` to wrangler's
 * logger, browser opener, interactivity detector, and config cache.
 *
 * The `generateAuthUrl` and `generateRandomState` overrides come from
 * wrangler's local re-export shims so that the existing `vi.mock(...)` calls
 * in `vitest.setup.ts` (which produce deterministic snapshot URLs) continue to
 * apply — the mocked versions are injected via the context here and used
 * internally by `@cloudflare/workers-auth`.
 */
export const oauthFlow = createOAuthFlow({
	logger,
	isNonInteractiveOrCI,
	openInBrowser,
	hasEnvCredentials: () => getAuthFromEnv() !== undefined,
	purgeOnLoginOrLogout: purgeConfigCaches,
	generateAuthUrl,
	generateRandomState,
});
