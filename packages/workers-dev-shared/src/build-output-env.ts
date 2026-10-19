/** Internal caller name set by the `cf-vite` delegate. */
export const CLI_DISPLAY_NAME_ENV_VAR = "CLOUDFLARE_VITE_CLI_DISPLAY_NAME";

/** Shared build context flag set by Cloudflare tooling for Preview builds. */
export const PREVIEW_BUILD_ENV_VAR = "CLOUDFLARE_PREVIEW_BUILD";

/** Return the CLI name used in actionable messages. */
export function getCliDisplayName(): "cf" | "Wrangler" {
	return process.env[CLI_DISPLAY_NAME_ENV_VAR] === "cf" ? "cf" : "Wrangler";
}

/** Whether Cloudflare tooling requested Preview Build Output. */
export function isPreviewBuild(): boolean {
	return process.env[PREVIEW_BUILD_ENV_VAR] === "true";
}
