import { createPlugin } from "../utils";
import type * as vite from "vite";

/**
 * Plugin to pass options to `@vitejs/plugin-rsc`
 */
export const rscPlugin = createPlugin("rsc", () => {
	return {
		enforce: "pre",
		config() {
			return { rsc: { serverHandler: false } } as vite.UserConfig;
		},
	};
});
