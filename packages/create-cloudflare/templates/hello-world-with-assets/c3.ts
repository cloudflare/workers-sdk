import type { TemplateConfig } from "../../src/templates";

const config: TemplateConfig = {
	configVersion: 1,
	id: "hello-world-with-assets",
	path: "templates/hello-world-with-assets",
	displayName: "SSR / full-stack app",
	description:
		"For sites with a backend API, or server-side rendering (SSR). Uses Static Assets with a Worker.",
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
