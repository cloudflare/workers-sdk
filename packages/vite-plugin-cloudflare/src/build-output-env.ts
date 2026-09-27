/**
 * Shared definition of the internal env var that the `cf-vite build`
 * delegate uses to force the experimental Build Output Specification on by default.
 */
export const FORCE_BUILD_OUTPUT_ENV_VAR = "CLOUDFLARE_VITE_FORCE_BUILD_OUTPUT";

/** Shared build context flag set by Cloudflare tooling for Preview builds. */
export const PREVIEW_BUILD_ENV_VAR = "CLOUDFLARE_PREVIEW_BUILD";

/** Whether `cf-vite build` has forced the Build Output Specification on. */
export function isForcedBuildOutput(): boolean {
	return process.env[FORCE_BUILD_OUTPUT_ENV_VAR] === "true";
}

/** Whether Cloudflare tooling requested Preview Build Output. */
export function isPreviewBuild(): boolean {
	return process.env[PREVIEW_BUILD_ENV_VAR] === "true";
}
