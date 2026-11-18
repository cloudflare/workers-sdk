// esbuild needs a file URL when rebundling ESM dependencies as CommonJS.
export const import_meta_url =
	require("node:url").pathToFileURL(__filename).href;
