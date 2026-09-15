import assert from "node:assert";
import { logRaw } from "@cloudflare/cli-shared-helpers";
import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import { downloadRemoteTemplate, updatePackageName } from "../../src/templates";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

type NextVariantValue = "vinext" | "opennext";

const VINEXT_TYPES_PATH = "./worker-configuration.d.ts";
const OPENNEXT_TYPES_PATH = "./cloudflare-env.d.ts";

type NextVariant = {
	value: NextVariantValue;
	label: string;
};

const NEXT_VARIANTS: NextVariant[] = [
	{
		value: "vinext",
		label: "vinext (recommended)",
	},
	{
		value: "opennext",
		label: "OpenNext adapter",
	},
];

async function getNextVariant(ctx: C3Context): Promise<NextVariant> {
	if (ctx.args.variant) {
		const selected = NEXT_VARIANTS.find(
			(variant) => variant.value === ctx.args.variant
		);
		if (!selected) {
			throw new Error(
				`Unknown Next.js variant "${
					ctx.args.variant
				}". Valid variants are: ${NEXT_VARIANTS.map((v) => v.value).join(", ")}`
			);
		}
		return selected;
	}

	const value = await inputPrompt({
		type: "select",
		question: "Which Next.js adapter do you want to use?",
		label: "variant",
		options: NEXT_VARIANTS,
		defaultValue: NEXT_VARIANTS[0].value,
		// Honour -y / --accept-defaults by taking the recommended vinext path.
		acceptDefault: Boolean(ctx.args.acceptDefaults),
	});

	const selected = NEXT_VARIANTS.find((variant) => variant.value === value);
	assert(selected, "Expected a Next.js variant to be selected");
	return selected;
}

async function generateVinext(ctx: C3Context) {
	// Delegate to create-vinext-app, which scaffolds a Next.js App Router project
	// already configured for vinext + Cloudflare Workers.
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
}

async function generateOpenNext(ctx: C3Context) {
	// Easy way to switch branch for local testing
	const branch = "main";

	const repoUrl = `github:opennextjs/opennextjs-cloudflare/create-cloudflare/next#${branch}`;

	await downloadRemoteTemplate(repoUrl, {
		intoFolder: ctx.project.path,
	});

	await updatePackageName(ctx);
}

const generate = async (ctx: C3Context) => {
	const variant = await getNextVariant(ctx);
	// Stash on args so transformPackageJson can branch without re-prompting.
	ctx.args.variant = variant.value;
	ctx.template.typesPath =
		variant.value === "opennext" ? OPENNEXT_TYPES_PATH : VINEXT_TYPES_PATH;

	if (variant.value === "opennext") {
		ctx.template.frameworkCliUsed = false;
		await generateOpenNext(ctx);
		return;
	}

	await generateVinext(ctx);
};

const envInterfaceName = "CloudflareEnv";

export default {
	configVersion: 1,
	id: "next",
	// Used by runFrameworkGenerator for the vinext path. OpenNext downloads a
	// remote template and does not invoke this CLI.
	frameworkCli: "create-vinext-app",
	platform: "workers",
	displayName: "Next.js",
	generate,
	transformPackageJson: async (_pkgJson, ctx) => {
		// OpenNext's remote template already has deploy/preview/cf-typegen.
		if (ctx.args.variant === "opennext") {
			return {};
		}

		return {
			scripts: {
				// Align with OpenNext so the shared previewScript: "preview" works
				// for both variants (vinext only ships dev/build/start/deploy).
				preview: `${npm} run build && ${npm} run start${npm === "npm" ? " --" : ""}`,
				"cf-typegen": `wrangler types --env-interface ${envInterfaceName} ${VINEXT_TYPES_PATH}`,
			},
		};
	},
	devScript: "dev",
	previewScript: "preview",
	deployScript: "deploy",
	typesPath: VINEXT_TYPES_PATH,
	envInterfaceName,
} as TemplateConfig;
