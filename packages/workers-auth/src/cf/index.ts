// The `cf` CLI's auth layer: the cf {@link AuthProduct} descriptor plus
// `createCfAuth`, a thin binding of the product-agnostic `createCloudflareAuth`
// factory (`../product/factory`) to cf's identity (client id, consent pages,
// keyring service name), config paths (`~/.config/cloudflare`), JSON file
// format, and cf-worded copy.
//
// This is the exact same auth machinery wrangler uses (`@cloudflare/workers-auth/wrangler`),
// differing only in the descriptor below.

import { JSON_FILE_FORMAT } from "../file-format";
import { createCloudflareAuth } from "../product/factory";
import { createKeyringPreference } from "../product/keyring-preference";
import { createPreferences } from "../product/preferences";
import { createCloudflareProfileStore } from "../product/profile-store";
import {
	CF_CLI_NAME,
	CF_CONSENT_PAGES,
	CF_KEYRING_SERVICE_NAME,
	CF_OAUTH_CALLBACK_URL,
} from "./constants";
import { getClientIdFromEnv } from "./env";
import { getCfConfigPath } from "./paths";
import { DefaultScopeKeys } from "./scopes";
import { getCfTemporaryAccountConfigPath } from "./temporary-account-path";
import type { OAuthFlowContext } from "../context";
import type { CloudflareAuth } from "../product/factory";
import type {
	KeyringPreferenceContext,
	SetKeyringPreferenceResult,
} from "../product/keyring-preference";
import type { AuthContext, AuthProduct } from "../product/types";
import type { ProfileStore } from "../profiles";

// --- Re-exports for cf consumers --------------------------------------------

export {
	createJsonFileStorage,
	defaultAuthConfigStorage,
	getAuthConfigFilePath,
	getEncryptedAuthConfigFilePath,
	readAuthConfigFile,
	writeAuthConfigFile,
} from "./auth-config-file";
export {
	DefaultScopeKeys,
	setLoginScopeKeys,
	validateScopeKeys,
	type Scope,
} from "./scopes";
export { getClientIdFromEnv } from "./env";
export { CF_OAUTH_CALLBACK_URL, CF_KEYRING_SERVICE_NAME } from "./constants";
export { getCfConfigPath } from "./paths";
export type { AuthContext, AuthProduct } from "../product/types";
export type { CloudflareAuth, CloudflareLoginProps } from "../product/factory";
export type {
	KeyringPreferenceContext,
	SetKeyringPreferenceResult,
} from "../product/keyring-preference";
export type { UserPreferences } from "../product/preferences";

// --- cf product descriptor --------------------------------------------------

/**
 * The cf {@link AuthProduct}: JSON files under `~/.config/cloudflare`, cf's
 * OAuth app / consent pages, the `"cloudflare"` keyring service, and cf-worded
 * copy.
 */
export const CF_PRODUCT: AuthProduct = {
	cliName: CF_CLI_NAME,
	keyringServiceName: CF_KEYRING_SERVICE_NAME,
	clientId: getClientIdFromEnv,
	consent: CF_CONSENT_PAGES,
	redirectUri: CF_OAUTH_CALLBACK_URL,
	// cf only supports the scoped `CLOUDFLARE_API_TOKEN` env var, not the global
	// API key + email pair, so the global-key resolution is disabled.
	allowGlobalAuthKey: false,
	getConfigPath: getCfConfigPath,
	getTemporaryAccountConfigPath: getCfTemporaryAccountConfigPath,
	fileFormat: JSON_FILE_FORMAT,
	accountCachePrefix: "cloudflare-account",
	// cf gets its own cache dir (`.cache/cloudflare` / `.cloudflare/cache`) so
	// `cf login`/`logout` never purges wrangler's shared cache.
	cacheNamespace: "cloudflare",
	// cf persists its default account in `config.json` (`defaults.accountId`);
	// this label is surfaced in the "set account_id in your <file>" hint.
	getConfigFileLabel: () => "cf config",
	getDefaultScopeKeys: () => DefaultScopeKeys,
};

// cf's preferences accessor (bound to cf's global config dir).
const cfPreferences = createPreferences(getCfConfigPath);
export const { readUserPreferences, updateUserPreferences } = cfPreferences;

/**
 * Build cf's auth layer, injecting the few consumer primitives that can't move
 * into the shared package (logger, interactive `prompt` / `select`, and the
 * User-Agent string).
 */
export function createCfAuth(ctx: AuthContext): CloudflareAuth {
	return createCloudflareAuth(CF_PRODUCT, ctx);
}

// --- cf-bound profile store + keyring preference ----------------------------

/** Consumer primitives {@link createCfProfileStore} needs. */
export interface CfProfileStoreContext {
	logger: OAuthFlowContext["logger"];
}

/** Build cf's {@link ProfileStore} (JSON `.json` / `.enc` files under `~/.config/cloudflare`). */
export function createCfProfileStore(ctx: CfProfileStoreContext): ProfileStore {
	return createCloudflareProfileStore({
		logger: ctx.logger,
		getConfigPath: getCfConfigPath,
		keyringServiceName: CF_KEYRING_SERVICE_NAME,
		format: JSON_FILE_FORMAT,
	});
}

const cfKeyringPreference = createKeyringPreference({
	cliName: CF_CLI_NAME,
	keyringServiceName: CF_KEYRING_SERVICE_NAME,
	getConfigPath: getCfConfigPath,
	format: JSON_FILE_FORMAT,
	preferences: cfPreferences,
});

/** Apply and persist cf's global keyring-storage preference. */
export function setKeyringPreference(
	enabled: boolean,
	ctx: KeyringPreferenceContext
): SetKeyringPreferenceResult {
	return cfKeyringPreference.setKeyringPreference(enabled, ctx);
}
