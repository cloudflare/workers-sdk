import { cp, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { processArgument } from "helpers/args";
import { runCommand } from "helpers/command";
import { detectPackageManager } from "helpers/packageManagers";
import { chooseAccount } from "../../src/wrangler/accounts";
import type { C3Context } from "types";

export async function copyExistingWorkerFiles(ctx: C3Context) {
	const { dlx } = detectPackageManager();

	await chooseAccount(ctx);

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
			"wrangler@3",
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

	// copy src/* files from the downloaded worker
	await cp(
		join(tempdir, ctx.args.existingScript, "src"),
		join(ctx.project.path, "src"),
		{ recursive: true },
	);

	// copy wrangler.toml from the downloaded worker
	await cp(
		join(tempdir, ctx.args.existingScript, "wrangler.toml"),
		join(ctx.project.path, "wrangler.toml"),
	);
}

export default {
	configVersion: 1,
	id: "pre-existing",
	displayName: "Pre-existing Worker (from Dashboard)",
	platform: "workers",
	hidden: true,
	copyFiles: {
		path: "./js",
	},
	configure: async (ctx: C3Context) => {
		await copyExistingWorkerFiles(ctx);

		// Force no-deploy since the worker is already deployed
		ctx.args.deploy = false;
	},
};
