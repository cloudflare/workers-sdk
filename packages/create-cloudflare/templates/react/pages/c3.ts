import { logRaw } from "@cloudflare/cli";
import { inputPrompt } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	const variant = await getVariant(ctx);

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

async function getVariant(ctx: C3Context) {
	if (ctx.args.variant) {
		const selected = variantsOptions.find((v) => v.value === ctx.args.variant);
		if (!selected) {
			throw new Error(
				`Unknown variant "${ctx.args.variant}". Valid variants are: ${variantsOptions.map((v) => v.value).join(", ")}`,
			);
		}
		return selected.value;
	}

	return await inputPrompt({
		type: "select",
		question: "Select a variant:",
		label: "variant",
		options: variantsOptions,
		defaultValue: variantsOptions[0].value,
	});
}

const config: TemplateConfig = {
	configVersion: 1,
	id: "react",
	// React's documentation now recommends using create-vite.
	frameworkCli: "create-vite",
	displayName: "React",
	platform: "pages",
	hidden: true,
	path: "templates/react/pages",
	copyFiles: { path: "./templates" },
	generate,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler pages deploy`,
			preview: `${npm} run build && wrangler pages dev`,
			"cf-typegen": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
