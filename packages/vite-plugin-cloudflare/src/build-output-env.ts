/**
 * Shared definition of the internal env var that the `cf-vite build`
 * delegate uses to force the experimental Build Output Specification on by default.
 */
export const FORCE_BUILD_OUTPUT_ENV_VAR = "CLOUDFLARE_VITE_FORCE_BUILD_OUTPUT";

/** Whether `cf-vite build` has forced the Build Output Specification on. */
export function isForcedBuildOutput(): boolean {
	return process.env[FORCE_BUILD_OUTPUT_ENV_VAR] === "true";
}
