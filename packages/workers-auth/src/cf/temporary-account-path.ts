import path from "node:path";
import { getCloudflareApiEnvironmentFromEnv } from "@cloudflare/workers-utils";
import { getCfConfigPath } from "./paths";

function getTemporaryAccountConfigFile(): string {
	const environment = getCloudflareApiEnvironmentFromEnv();
	return environment === "production"
		? "cloudflare-temporary-account.json"
		: `cloudflare-temporary-account.${environment}.json`;
}

/**
 * Absolute path to cf's temporary-preview-account cache file, under the cf
 * global config directory and scoped to the current `WRANGLER_API_ENVIRONMENT`.
 * A JSON file (cf's on-disk format), paired with `createFileStorage` to build
 * the `TemporaryAccountStorage` embedded in the OAuth flow.
 */
export function getCfTemporaryAccountConfigPath(): string {
	return path.join(getCfConfigPath(), getTemporaryAccountConfigFile());
}
