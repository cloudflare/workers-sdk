import type { BuildOptions } from "esbuild";

export const loader: BuildOptions["loader"] = {
	".html": "text",
	".txt": "text",
};
