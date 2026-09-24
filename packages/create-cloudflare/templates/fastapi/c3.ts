import type { TemplateConfig } from "../../src/templates";

export default {
	configVersion: 1,
	id: "fastapi",
	displayName: "FastAPI",
	description: "A FastAPI application running on Cloudflare Workers",
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
