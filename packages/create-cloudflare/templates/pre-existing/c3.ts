import { existsSync } from "node:fs";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { processArgument } from "helpers/args";
import { runCommand } from "helpers/command";
import { detectPackageManager } from "helpers/packageManagers";
import { chooseAccount, wranglerLogin } from "../../src/wrangler/accounts";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

export async function copyExistingWorkerFiles(ctx: C3Context) {
	const { dlx } = detectPackageManager();

	if (ctx.args.existingScript === undefined) {
		ctx.args.existingScript = await processArgument(
			ctx.args,
			"existingScript",
			{
				type: "text",
				question:
					"Please specify the name of the existing worker in this account?",
				label: "worker",
				defaultValue: ctx.project.name,
			},
		);
	}

	// `wrangler init --from-dash` bails if you opt-out of creating a package.json
	// so run it (with -y) in a tempdir and copy the src files after
	const tempdir = await mkdtemp(join(tmpdir(), "c3-wrangler-init--from-dash-"));
	await runCommand(
		[
			...dlx,
			"wrangler@latest",
			"init",
			"--from-dash",
			ctx.args.existingScript,
			"-y",
			"--no-delegate-c3",
		],
		{
			silent: true,
			cwd: tempdir, // use a tempdir because we don't want all the files
			env: { CLOUDFLARE_ACCOUNT_ID: ctx.account?.id },
			startText: "Downloading existing worker files",
			doneText: `${brandColor("downloaded")} ${dim(
				`existing "${ctx.args.existingScript}" worker files`,
			)}`,
		},
	);

	// copy src/* files from the downloaded Worker
	await cp(
		join(tempdir, ctx.args.existingScript, "src"),
		join(ctx.project.path, "src"),
		{ recursive: true },
	);

	// copy wrangler config file from the downloaded Worker
	const configFiles = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"];
	let configFileCopied = false;

	for (const configFile of configFiles) {
		const sourcePath = join(tempdir, ctx.args.existingScript, configFile);
		if (existsSync(sourcePath)) {
			await cp(sourcePath, join(ctx.project.path, configFile));
			configFileCopied = true;
			break;
		}
	}

	if (!configFileCopied) {
		throw new Error(
			`No wrangler configuration file found in downloaded worker. Expected one of: ${configFiles.join(", ")}`,
		);
	}
}

const config: TemplateConfig = {
	configVersion: 1,
	id: "pre-existing",
	displayName: "Pre-existing Worker (from Dashboard)",
	description: "Fetch a Worker initialized from the Cloudflare dashboard.",
	platform: "workers",
	hidden: true,
	copyFiles: {
		path: "./js",
	},
	configure: buildConfigure({
		login: wranglerLogin,
		chooseAccount,
		copyFiles: copyExistingWorkerFiles,
	}),
};

export default config;

export interface ConfigureParams {
	login: (ctx: C3Context) => Promise<boolean>;
	chooseAccount: (ctx: C3Context) => Promise<void>;
	copyFiles: (ctx: C3Context) => Promise<void>;
}

export function buildConfigure(params: ConfigureParams) {
	return async function configure(ctx: C3Context) {
		const loginSuccess = await params.login(ctx);

		if (!loginSuccess) {
			throw new Error("Failed to login to Cloudflare");
		}

		await params.chooseAccount(ctx);
		await params.copyFiles(ctx);

		// Force no-deploy since the Worker is already deployed
		ctx.args.deploy = false;
	};
}
