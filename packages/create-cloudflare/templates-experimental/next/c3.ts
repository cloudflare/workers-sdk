import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { readFile, usesTypescript, writeFile } from "helpers/files";
import { installPackages } from "helpers/packages";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [ctx.project.name]);
};

const configure = async (ctx: C3Context) => {
	const packages = [
		"@opennextjs/cloudflare@0.5.x",
		"@cloudflare/workers-types",
	];
	await installPackages(packages, {
		dev: true,
		startText: "Adding the Cloudflare adapter",
		doneText: `${brandColor(`installed`)} ${dim(packages.join(", "))}`,
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

export default {
	configVersion: 1,
	id: "next",
	frameworkCli: "create-next-app",
	// TODO: Stop using a pinned version when the template graduates.
	frameworkCliPinnedVersion: "~15.2.2",
	platform: "workers",
	displayName: "Next.js (using Node.js compat + Workers Assets)",
	path: "templates-experimental/next",
	copyFiles: {
		path: "./templates",
	},
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `opennextjs-cloudflare && wrangler deploy`,
			preview: `opennextjs-cloudflare && wrangler dev`,
			"cf-typegen": `wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts`,
		},
	}),
	devScript: "dev",
	previewScript: "preview",
	deployScript: "deploy",
	compatibilityFlags: ["nodejs_compat"],
} as TemplateConfig;
