import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	mode: "virtual-module-main",
	plugins: [
		{
			name: "virtual-module-plugin",
			resolveId(source) {
				if (source === "virtual:entry") {
					return `\0${source}`;
				}
			},
			load(id) {
				if (id === "\0virtual:entry") {
					return `
export default {
	fetch() {
		return new Response("Virtual module as Worker entry file");
	}
}
					`;
				}
			},
		},
		cloudflare({
			types: { includeRuntime: false },
			inspectorPort: false,
			persistState: false,
		}),
	],
});
