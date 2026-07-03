import path from "node:path";
import {
	getCloudflareApiEnvironmentFromEnv,
	getGlobalConfigPath,
} from "@cloudflare/workers-utils";

function getTemporaryAccountConfigFile(): string {
	const environment = getCloudflareApiEnvironmentFromEnv();
	return environment === "production"
		? "wrangler-temporary-account.toml"
		: `wrangler-temporary-account.${environment}.toml`;
}

/**
 * Absolute path to wrangler's temporary-preview-account cache file, under the
 * global Wrangler config directory and scoped to the current
 * `WRANGLER_API_ENVIRONMENT`. Paired with `createTomlFileStorage` to build the
 * `TemporaryAccountStorage` injected into the OAuth flow.
 */
export function getTemporaryPreviewAccountConfigPath(): string {
	return path.join(getGlobalConfigPath(), getTemporaryAccountConfigFile());
}
