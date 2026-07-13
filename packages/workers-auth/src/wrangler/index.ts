// Wrangler's auth layer: the wrangler {@link CliDescriptor} descriptor plus
// `createWranglerAuth`, a thin binding of the CLI-agnostic
// `createCloudflareAuth` factory (`../core/factory`) to wrangler's identity
// (client id, consent pages, keyring service name), config paths, TOML file
// format, and user-facing copy.
//
// Everything wrangler's `src/user/*` code imports from
// `@cloudflare/workers-auth/wrangler` is re-exported here so those import paths
// (and the test mocks/spies) keep working unchanged.

import { configFileName, getGlobalConfigPath } from "@cloudflare/workers-utils";
import { createCloudflareAuth } from "../core/factory";
import { createKeyringPreference } from "../core/keyring-preference";
import { createPreferences } from "../core/preferences";
import { createCloudflareProfileStore } from "../core/profile-store";
import { DefaultScopeKeys } from "../core/scopes";
import {
	OAUTH_CALLBACK_URL,
	WRANGLER_CLI_NAME,
	WRANGLER_CONSENT_PAGES,
	WRANGLER_KEYRING_SERVICE_NAME,
} from "./constants";
import { getClientIdFromEnv } from "./env";
import { getTemporaryPreviewAccountConfigPath } from "./temporary-account-path";
import type { OAuthFlowContext } from "../context";
import type { CloudflareAuth, CloudflareLoginProps } from "../core/factory";
import type {
	KeyringPreferenceContext,
	SetKeyringPreferenceResult,
} from "../core/keyring-preference";
import type { AuthContext, CliDescriptor } from "../core/types";
import type { ProfileStore } from "../profiles";

// --- Re-exports for wrangler's `src/user/*` consumers -----------------------

export {
	createTomlFileStorage,
	defaultAuthConfigStorage,
	getAuthConfigFilePath,
	getEncryptedAuthConfigFilePath,
	readAuthConfigFile,
	writeAuthConfigFile,
} from "./auth-config-file";
export {
	DefaultScopes,
	DefaultScopeKeys,
	setLoginScopeKeys,
	validateScopeKeys,
	type Scope,
} from "../core/scopes";
export { getClientIdFromEnv } from "./env";
export { OAUTH_CALLBACK_URL, WRANGLER_KEYRING_SERVICE_NAME } from "./constants";
export type { SetKeyringPreferenceResult } from "../core/keyring-preference";

/** @deprecated Use {@link AuthContext}. Kept as an alias for wrangler's historical name. */
export type WranglerAuthContext = AuthContext;
/** @deprecated Use {@link CloudflareAuth}. */
export type WranglerAuth = CloudflareAuth;
/** @deprecated Use {@link CloudflareLoginProps}. */
export type WranglerLoginProps = CloudflareLoginProps;

// --- Wrangler CLI descriptor --------------------------------------------

/**
 * The wrangler {@link CliDescriptor}: TOML files under wrangler's global config
 * directory, wrangler's OAuth app / consent pages, the `"wrangler"` keyring
 * service, and wrangler-worded copy.
 */
export const WRANGLER_CLI: CliDescriptor = {
	cliName: WRANGLER_CLI_NAME,
	keyringServiceName: WRANGLER_KEYRING_SERVICE_NAME,
	clientId: getClientIdFromEnv,
	consent: WRANGLER_CONSENT_PAGES,
	redirectUri: OAUTH_CALLBACK_URL,
	allowGlobalAuthKey: true,
	getConfigPath: getGlobalConfigPath,
	getTemporaryAccountConfigPath: getTemporaryPreviewAccountConfigPath,
	fileFormat: "toml",
	accountCachePrefix: "wrangler-account",
	getConfigFileLabel: () => configFileName(undefined),
	// A getter so wrangler's `--experimental-scopes` reassignment of the live
	// `DefaultScopeKeys` binding is observed.
	getDefaultScopeKeys: () => DefaultScopeKeys,
};

// Wrangler's preferences accessor (bound to wrangler's global config dir),
// re-exported for wrangler's keyring commands.
const wranglerPreferences = createPreferences(getGlobalConfigPath);
export const { readUserPreferences, updateUserPreferences } =
	wranglerPreferences;
export type { UserPreferences } from "../core/preferences";

/**
 * Build wrangler's auth layer, injecting the few consumer primitives that can't
 * move into the shared package (logger, interactive `prompt` / `select`, and
 * the User-Agent string).
 */
export function createWranglerAuth(ctx: AuthContext): CloudflareAuth {
	return createCloudflareAuth(WRANGLER_CLI, ctx);
}

// --- Wrangler-bound profile store + keyring preference ----------------------

/** Consumer primitives {@link createWranglerProfileStore} needs. */
export interface WranglerProfileStoreContext {
	logger: OAuthFlowContext["logger"];
}

/**
 * Build wrangler's {@link ProfileStore} (TOML `.toml` / `.enc` files under the
 * global config dir), bound to wrangler's config path, keyring service, and
 * TOML format.
 */
export function createWranglerProfileStore(
	ctx: WranglerProfileStoreContext
): ProfileStore {
	return createCloudflareProfileStore({
		logger: ctx.logger,
		getConfigPath: getGlobalConfigPath,
		keyringServiceName: WRANGLER_KEYRING_SERVICE_NAME,
		format: "toml",
	});
}

const wranglerKeyringPreference = createKeyringPreference({
	cliName: WRANGLER_CLI_NAME,
	keyringServiceName: WRANGLER_KEYRING_SERVICE_NAME,
	getConfigPath: getGlobalConfigPath,
	format: "toml",
	preferences: wranglerPreferences,
});

/**
 * Apply and persist the global keyring-storage preference. Shared by
 * `wrangler auth keyring enable|disable` and `wrangler login --use-keyring` /
 * `--no-use-keyring`.
 */
export function setKeyringPreference(
	enabled: boolean,
	ctx: KeyringPreferenceContext
): SetKeyringPreferenceResult {
	return wranglerKeyringPreference.setKeyringPreference(enabled, ctx);
}

export type { KeyringPreferenceContext } from "../core/keyring-preference";
