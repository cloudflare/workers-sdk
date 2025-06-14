import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { readFile, usesTypescript, writeFile } from "helpers/files";
import { installPackages } from "helpers/packages";
import type { TemplateConfig } from "../../../src/templates";
import type { C3Context } from "types";

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [ctx.project.name]);
};

const configure = async (ctx: C3Context) => {
	await installPackages(["@opennextjs/cloudflare@^1.3.0"], {
		startText: "Adding the Cloudflare adapter",
		doneText: `${brandColor(`installed`)} @opennextjs/cloudflare)}`,
	});

	const usesTs = usesTypescript(ctx);

	updateNextConfig(usesTs);
};

const updateNextConfig = (usesTs: boolean) => {
	const s = spinner();

	const configFile = `next.config.${usesTs ? "ts" : "mjs"}`;
	s.start(`Updating \`${configFile}\``);

	const configContent = readFile(configFile);

	const updatedConfigFile =
		configContent +
		`
		// added by create cloudflare to enable calling \`getCloudflareContext()\` in \`next dev\`
		import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
		initOpenNextCloudflareForDev();
		`.replace(/\n\t*/g, "\n");

	writeFile(configFile, updatedConfigFile);

	s.stop(`${brandColor(`updated`)} ${dim(`\`${configFile}\``)}`);
};

const envInterfaceName = "CloudflareEnv";
const typesPath = "./cloudflare-env.d.ts";
export default {
	configVersion: 1,
	id: "next",
	frameworkCli: "create-next-app",
	platform: "workers",
	displayName: "Next.js",
	path: "templates/next/workers",
	copyFiles: {
		path: "./templates",
	},
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `opennextjs-cloudflare build && opennextjs-cloudflare deploy`,
			preview: `opennextjs-cloudflare build && opennextjs-cloudflare preview`,
			"cf-typegen": `wrangler types --env-interface ${envInterfaceName} ${typesPath}`,
		},
	}),
	devScript: "dev",
	previewScript: "preview",
	deployScript: "deploy",
	typesPath,
	envInterfaceName,
} as TemplateConfig;
