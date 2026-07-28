import { logRaw } from "@cloudflare/cli-shared-helpers";
import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	// Delegate to create-vinext-app, which scaffolds a Next.js App Router project
	// already configured for vinext + Cloudflare Workers.
	//
	// Flags:
	// - --platform cloudflare: Workers is the default deployment target
	// - --yes: accept create-vinext-app defaults (no interactive prompts)
	// - --skip-install: C3 installs dependencies itself after generate()
	// - --disable-git: C3 owns git init / first commit
	// - package-manager flag: keep the nested install path consistent with C3's PM
	const pmFlag =
		npm === "pnpm"
			? "--use-pnpm"
			: npm === "yarn"
				? "--use-yarn"
				: npm === "bun"
					? "--use-bun"
					: "--use-npm";

	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--platform",
		"cloudflare",
		// Avoid a placeholder KV namespace id that would block `wrangler deploy`
		// until the user manually provisions one. Caching can be added later
		// via vinext's Cloudflare cache adapters.
		"--data-cache",
		"none",
		"--yes",
		"--skip-install",
		"--disable-git",
		pmFlag,
	]);

	logRaw("");
};

const envInterfaceName = "CloudflareEnv";
const typesPath = "./worker-configuration.d.ts";

export default {
	configVersion: 1,
	id: "next",
	frameworkCli: "create-vinext-app",
	platform: "workers",
	displayName: "Next.js",
	generate,
	// create-vinext-app already writes fully-wired scripts; keep C3's standard
	// cf-typegen helper so `wrangler types` stays one command away.
	transformPackageJson: async () => ({
		scripts: {
			"cf-typegen": `wrangler types --env-interface ${envInterfaceName} ${typesPath}`,
		},
	}),
	devScript: "dev",
	// vinext has no separate "preview" script; `start` runs the built Worker
	// locally via `wrangler dev` against the production build output.
	previewScript: "start",
	deployScript: "deploy",
	typesPath,
	envInterfaceName,
} as TemplateConfig;
