/** Shared build context flag set by Cloudflare tooling for Preview builds. */
export const PREVIEW_BUILD_ENV_VAR = "CLOUDFLARE_PREVIEW_BUILD";

/** Whether Cloudflare tooling requested Preview Build Output. */
export function isPreviewBuild(): boolean {
	return process.env[PREVIEW_BUILD_ENV_VAR] === "true";
}
