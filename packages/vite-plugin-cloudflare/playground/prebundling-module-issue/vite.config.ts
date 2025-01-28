import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({ persistState: false }),
		{
			name: "my-plugin",
			resolveId(id) {
				if (id === "virtual:my-module") {
					return "\0virtual:my-module";
				}
			},
			load(id) {
				if (id === "\0virtual:my-module") {
					return `export { msg } from "@packages/lib-b";`;
				}
			},
		},
	],
});
