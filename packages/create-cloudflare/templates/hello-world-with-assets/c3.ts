import type { TemplateConfig } from "../../src/templates";

const config: TemplateConfig = {
	configVersion: 1,
	id: "hello-world-with-assets",
	path: "templates/hello-world-with-assets",
	displayName: "Worker + Assets",
	description: "For static sites with an API or server-side rendering (SSR)",
	platform: "workers",
	copyFiles: {
		variants: {
			js: {
				path: "./js",
			},
			ts: {
				path: "./ts",
			},
			python: {
				path: "./py",
			},
		},
	},
};
export default config;
