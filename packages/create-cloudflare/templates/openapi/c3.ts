import type { TemplateConfig } from "../../src/templates";

const config: TemplateConfig = {
	configVersion: 1,
	id: "openapi",
	displayName: "API starter (OpenAPI compliant)",
	description: "Get started building a basic API on Workers",
	platform: "workers",
	copyFiles: {
		path: "./ts",
	},
};

export default config;
