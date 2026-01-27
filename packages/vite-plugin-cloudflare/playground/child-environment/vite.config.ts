import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			inspectorPort: false,
			persistState: false,
			viteEnvironment: {
				name: "parent",
				childEnvironments: ["child"],
			},
		}),
		{
			name: "virtual-module-plugin",
			resolveId(source) {
				if (source === "virtual:environment-name") {
					return "\0virtual:environment-name";
				}
			},
			load(id) {
				if (id === "\0virtual:environment-name") {
					return `export function getEnvironmentName() { return ${JSON.stringify(this.environment.name)} }`;
				}
			},
		},
	],
});
