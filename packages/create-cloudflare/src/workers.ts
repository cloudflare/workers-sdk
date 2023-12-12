import { cp, mkdtemp, readdir, rename, rm } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { chdir } from "process";
import { endSection, startSection, updateStatus } from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { C3_DEFAULTS } from "helpers/cli";
import { spinner } from "@cloudflare/cli/interactive";
import { processArgument } from "helpers/args";
import {
	getWorkerdCompatibilityDate,
	installWorkersTypes,
	npmInstall,
	runCommand,
} from "helpers/command";
import {
	appendFile,
	readFile,
	readJSON,
	writeFile,
	writeJSON,
} from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { chooseAccount } from "./common";
import { copyTemplateFiles } from "./templateMap";
import type { C3Context } from "types";

const { dlx } = detectPackageManager();

export const runWorkersGenerator = async (ctx: C3Context) => {
	await copyTemplateFiles(ctx);
	chdir(ctx.project.path);

	await updateFiles(ctx);
	await offerGit(ctx);
	endSection("Application created");

	startSection("Installing dependencies", "Step 2 of 3");
	await npmInstall();
	if (ctx.args.ts) {
		await installWorkersTypes(ctx);
	}
	await installWorkersTypes(ctx);
	await updateFiles(ctx);
};

export async function createWranglerToml(ctx: C3Context) {
	if (ctx.template.platform !== "workers") {
		return;
	}

	// The formatting below is ugly, but necessary to avoid formatting the output file
	const wranglerTomlPath = resolve(ctx.project.path, "wrangler.toml");
	const wranglerToml = `name = "${ctx.project.name}"
main = "src/index.ts"
compatibility_date = "${await getWorkerdCompatibilityDate()}"
  `;
	writeFile(wranglerTomlPath, wranglerToml);
}

export async function appendToWranglerToml(ctx: C3Context, content: string) {
	if (ctx.template.platform !== "workers") {
		return;
	}

	const wranglerTomlPath = resolve(ctx.project.path, "wrangler.toml");
	appendFile(wranglerTomlPath, content);
}

async function copyExistingWorkerFiles(ctx: C3Context) {
	await chooseAccount(ctx);

	if (ctx.args.existingScript === undefined) {
		ctx.args.existingScript = await processArgument<string>(
			ctx.args,
			"existingScript",
			{
				type: "text",
				question:
					"Please specify the name of the existing worker in this account?",
				label: "worker",
				defaultValue: ctx.project.name,
			}
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
				`existing "${ctx.args.existingScript}" worker files`
			)}`,
		}
	);

	// remove any src/* files from the template
	for (const filename of await readdir(join(ctx.project.path, "src"))) {
		await rm(join(ctx.project.path, "src", filename));
	}

	// copy src/* files from the downloaded worker
	await cp(
		join(tempdir, ctx.args.existingScript, "src"),
		join(ctx.project.path, "src"),
		{ recursive: true }
	);

	// copy wrangler.toml from the downloaded worker
	await cp(
		join(tempdir, ctx.args.existingScript, "wrangler.toml"),
		join(ctx.project.path, "wrangler.toml")
	);
}

async function updateFiles(ctx: C3Context) {
	// Update package.json with project name
	const pkgJsonPath = resolve(ctx.project.path, "package.json");
	const pkgJson = readJSON(pkgJsonPath);
	if (pkgJson.name === "<TBD>") {
		pkgJson.name = ctx.project.name;
	}
	writeJSON(pkgJsonPath, pkgJson);
}
