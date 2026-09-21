/** Internal flag set by `cf-vite build --preview`. */
export const PREVIEW_BUILD_ENV_VAR = "CLOUDFLARE_VITE_PREVIEW_BUILD";

/** Whether the current Build Output build targets a Preview deployment. */
export function isPreviewBuild(): boolean {
	return process.env[PREVIEW_BUILD_ENV_VAR] === "true";
}
