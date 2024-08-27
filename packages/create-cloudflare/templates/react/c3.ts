import { logRaw } from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	const variant = await processArgument<string>(ctx.args, "variant", {
		type: "select",
		question: "Select a variant:",
		label: "variant",
		options: variantsOptions,
		defaultValue: variantsOptions[0].value,
	});

	await runFrameworkGenerator(ctx, [ctx.project.name, "--template", variant]);

	logRaw("");
};

const variantsOptions = [
	{
		value: "react-ts",
		label: "TypeScript",
	},
	{
		value: "react-swc-ts",
		label: "TypeScript + SWC",
	},
	{
		value: "react",
		label: "JavaScript",
	},
	{
		value: "react-swc",
		label: "JavaScript + SWC",
	},
];

const config: TemplateConfig = {
	configVersion: 1,
	id: "react",
	displayName: "React",
	platform: "pages",
	generate,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler pages deploy ./dist`,
			preview: `${npm} run build && wrangler pages dev ./dist`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
