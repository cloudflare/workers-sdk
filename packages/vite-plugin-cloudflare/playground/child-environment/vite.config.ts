import assert from "node:assert";
import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	environments: {
		child: {
			build: {
				rollupOptions: {
					input: path.resolve(__dirname, "src/child-environment-module.ts"),
				},
			},
		},
	},
	builder: {
		async buildApp(builder) {
			const parentEnvironment = builder.environments.parent;
			const childEnvironment = builder.environments.child;

			assert(parentEnvironment, `No "parent" environment`);
			assert(childEnvironment, `No "child" environment`);

			await builder.build(parentEnvironment);
			await builder.build(childEnvironment);
		},
	},
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
