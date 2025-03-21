import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		{
			name: "virtual-module-plugin",
			resolveId(id) {
				if (id === "virtual:module") {
					return `\0virtual:module`;
				}
			},
			load(id) {
				if (id === "\0virtual:module") {
					return `export default 'virtual module'`;
				}
			},
		},
		cloudflare(),
	],
});
