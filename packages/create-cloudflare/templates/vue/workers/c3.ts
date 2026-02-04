import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { inputPrompt, spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { readJSON, usesTypescript, writeJSON } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import type { TemplateConfig } from "../../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	const lang =
		ctx.args.lang ??
		(await inputPrompt({
			type: "select",
			question: "Would you like to use TypeScript?",
			label: "Language",
			options: [
				{ label: "TypeScript", value: "ts" },
				{ label: "JavaScript", value: "js" },
			],
		}));
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--router",
		lang === "ts" ? "--ts" : "",
	]);
	logRaw("");
};

const configure = async (ctx: C3Context) => {
	await installPackages(["@cloudflare/vite-plugin"], {
		dev: true,
		startText: "Installing the Cloudflare Vite plugin",
		doneText: `${brandColor(`installed`)} ${dim("@cloudflare/vite-plugin")}`,
	});

	if (usesTypescript(ctx)) {
		updateTsconfigJson();
	}
};

function updateTsconfigJson() {
	const s = spinner();
	s.start(`Updating tsconfig.json config`);
	// Add a reference to the extra tsconfig.worker.json file.
	// ```
	// "references": [ ..., { path: "./tsconfig.worker.json" } ]
	// ```
	const tsconfig = readJSON("tsconfig.json") as { references: object[] };
	if (tsconfig && typeof tsconfig === "object") {
		tsconfig.references ??= [];
		tsconfig.references.push({ path: "./tsconfig.worker.json" });
	}
	writeJSON("tsconfig.json", tsconfig);
	s.stop(`${brandColor(`updated`)} ${dim(`\`tsconfig.json\``)}`);
}

const config: TemplateConfig = {
	configVersion: 1,
	id: "vue",
	frameworkCli: "create-vue",
	platform: "workers",
	displayName: "Vue",
	path: "templates/vue/workers",
	copyFiles: {
		variants: {
			ts: {
				path: "./ts",
			},
			js: {
				path: "./js",
			},
		},
	},
	configure,
	generate,
	transformPackageJson: async (_, ctx) => ({
		scripts: {
			deploy: `${npm} run build && wrangler deploy`,
			preview: `${npm} run build && wrangler dev`,
			...(usesTypescript(ctx) && { "cf-typegen": `wrangler types` }),
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
