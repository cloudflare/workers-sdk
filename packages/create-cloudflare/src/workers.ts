import { cp, mkdtemp, readdir, rename, rm } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { chdir } from "process";
import { endSection, startSection, updateStatus } from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { C3_DEFAULTS } from "helpers/cli";
import {
	getWorkerdCompatibilityDate,
	installWorkersTypes,
	npmInstall,
	runCommand,
} from "helpers/command";
import { readFile, readJSON, writeFile, writeJSON } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import {
	chooseAccount,
	gitCommit,
	isInsideGitRepo,
	offerGit,
	offerToDeploy,
	printSummary,
	runDeploy,
	setupProjectDirectory,
} from "./common";
import type { C3Args, C3Context as Context } from "types";

const { dlx } = detectPackageManager();

export const runWorkersGenerator = async (args: C3Args) => {
	const originalCWD = process.cwd();
	const { name, path } = setupProjectDirectory(args);

	const ctx: Context = {
		project: { name, path },
		args,
		originalCWD,
		gitRepoAlreadyExisted: await isInsideGitRepo(dirname(path)),
	};
	const { preexisting } = await getTemplate(ctx);

	if (preexisting) {
		ctx.args.ts = false;
	}

	ctx.args.ts = await processArgument<boolean>(ctx.args, "ts", {
		type: "confirm",
		question: "Do you want to use TypeScript?",
		label: "typescript",
		defaultValue: C3_DEFAULTS.ts,
	});

	await copyFiles(ctx);
	await copyExistingWorkerFiles(ctx);
	await updateFiles(ctx);
	await offerGit(ctx);
	endSection("Application created");

	startSection("Installing dependencies", "Step 2 of 3");
	chdir(ctx.project.path);
	await npmInstall();
	if (ctx.args.ts) {
		await installWorkersTypes(ctx);
	}
	await gitCommit(ctx);
	endSection("Dependencies Installed");
	if (!preexisting) {
		await offerToDeploy(ctx);
		await runDeploy(ctx);
	}

	await printSummary(ctx);
};

async function getTemplate(ctx: Context) {
	const preexisting = ctx.args.type === "pre-existing";
	const template = preexisting ? "hello-world" : ctx.args.type;
	const path = resolve(
		// eslint-disable-next-line no-restricted-globals
		__dirname,
		"..",
		"templates",
		template,
		ctx.args.ts ? "ts" : "js"
	);

	return { preexisting, template, path };
}

async function copyFiles(ctx: Context) {
	const { template, path: srcdir } = await getTemplate(ctx);
	const destdir = ctx.project.path;

	// copy template files
	updateStatus(`Copying files from "${template}" template`);
	await cp(srcdir, destdir, { recursive: true });

	// reverse renaming from build step
	await rename(join(destdir, "__dot__gitignore"), join(destdir, ".gitignore"));
}

async function copyExistingWorkerFiles(ctx: Context) {
	const { preexisting } = await getTemplate(ctx);

	if (preexisting) {
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
		const tempdir = await mkdtemp(
			join(tmpdir(), "c3-wrangler-init--from-dash-")
		);
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
}

async function updateFiles(ctx: Context) {
	// Update package.json with project name
	const pkgJsonPath = resolve(ctx.project.path, "package.json");
	const pkgJson = readJSON(pkgJsonPath);
	if (pkgJson.name === "<TBD>") {
		pkgJson.name = ctx.project.name;
	}
	writeJSON(pkgJsonPath, pkgJson);

	// Update wrangler.toml with name and compat date
	const wranglerTomlPath = resolve(ctx.project.path, "wrangler.toml");
	let wranglerToml = readFile(wranglerTomlPath);
	wranglerToml = wranglerToml
		.replace(/^name\s*=\s*"<TBD>"/m, `name = "${ctx.project.name}"`)
		.replace(
			/^compatibility_date\s*=\s*"<TBD>"/m,
			`compatibility_date = "${await getWorkerdCompatibilityDate()}"`
		);
	writeFile(wranglerTomlPath, wranglerToml);
}
