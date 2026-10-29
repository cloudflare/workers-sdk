import type { TemplateConfig } from "../../src/templates";

export default {
	configVersion: 1,
	id: "flask",
	displayName: "Flask",
	description: "A Flask application running on Cloudflare Workers",
	platform: "workers",
	copyFiles: {
		variants: {
			python: {
				path: "./py",
			},
		},
	},
	workersTypes: "none",
	devScript: "dev",
	deployScript: "deploy",
} satisfies TemplateConfig;
