// Replace all backslashes with forward slashes to ensure that their use
// in shellac scripts doesn't break.
export const WRANGLER = process.env.WRANGLER?.replaceAll("\\", "/") ?? "";
export const WRANGLER_IMPORT =
	process.env.WRANGLER_IMPORT?.replaceAll("\\", "/") ?? "";
