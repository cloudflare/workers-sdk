import { readFile, writeFile, mkdtemp, cp, rm, readdir } from "fs/promises";
import { tmpdir } from "os";
import { resolve, join } from "path";
import { chdir } from "process";
import { endSection, updateStatus, startSection } from "helpers/cli";
import { brandColor, dim } from "helpers/colors";
import { npmInstall, runCommand } from "helpers/command";
import { confirmInput, textInput } from "helpers/interactive";
import {
	chooseAccount,
	offerToDeploy,
	printSummary,
	runDeploy,
	setupProjectDirectory,
} from "./common";
import type {
	PagesGeneratorArgs as Args,
	PagesGeneratorContext as Context,
} from "types";

export const runWorkersGenerator = async (args: Args) => {
	const { name, path, relativePath } = setupProjectDirectory(args);

	const ctx: Context = {
		project: { name, relativePath, path },
		args,
	};

	await copyFiles(ctx);
	await copyExistingWorkerFiles(ctx);
	await updateFiles(ctx);
	endSection("Application created");

	startSection("Installing dependencies", "Step 2 of 3");
	chdir(ctx.project.path);
	await npmInstall();
	endSection("Dependencies Installed");

	await offerToDeploy(ctx);
	await runDeploy(ctx);

	await printSummary(ctx);
};

async function getTemplate(ctx: Context) {
	if (ctx.args.ts === undefined) {
		ctx.args.ts = await confirmInput({
			question: "Do you want to use TypeScript?",
			renderSubmitted: (value) =>
				`${brandColor("typescript")} ${dim(`${value ? "yes" : "no"}`)}`,
			defaultValue: true,
		});
	}

	const preexisting = ctx.args.type === "pre-existing";
	const template = preexisting ? "simple" : ctx.args.type;
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
}

async function copyExistingWorkerFiles(ctx: Context) {
	const { preexisting } = await getTemplate(ctx);

	if (preexisting) {
		await chooseAccount(ctx);

		if (ctx.existingScript === undefined) {
			ctx.existingScript = await textInput({
				question:
					"Please specify the name of the existing worker in this account?",
				renderSubmitted: (value) =>
					`${brandColor("worker")} ${dim(`"${value}"`)}`,
				defaultValue: ctx.project.name,
			});
		}

		// `wrangler init --from-dash` bails if you opt-out of creating a package.json
		// so run it (with -y) in a tempdir and copy the src files after
		const tempdir = await mkdtemp(
			join(tmpdir(), "c3-wrangler-init--from-dash-")
		);
		await runCommand(
			`npx wrangler@3 init --from-dash ${ctx.existingScript} -y`,
			{
				silent: true,
				cwd: tempdir, // use a tempdir because we don't want all the files
				env: { CLOUDFLARE_ACCOUNT_ID: ctx.account?.id },
				startText: "Downloading existing worker files",
				doneText: `${brandColor("downloaded")} ${dim(
					`existing "${ctx.existingScript}" worker files`
				)}`,
			}
		);

		// remove any src/* files from the template
		for (const filename of await readdir(join(ctx.project.path, "src"))) {
			await rm(join(ctx.project.path, "src", filename));
		}

		// copy src/* files from the downloaded worker
		await cp(
			join(tempdir, ctx.existingScript, "src"),
			join(ctx.project.path, "src"),
			{ recursive: true }
		);

		// copy wrangler.toml from the downloaded worker
		await cp(
			join(tempdir, ctx.existingScript, "wrangler.toml"),
			join(ctx.project.path, "wrangler.toml")
		);
	}
}

async function updateFiles(ctx: Context) {
	// build file paths
	const paths = {
		packagejson: resolve(ctx.project.path, "package.json"),
		wranglertoml: resolve(ctx.project.path, "wrangler.toml"),
	};

	// read files
	const contents = {
		packagejson: JSON.parse(await readFile(paths.packagejson, "utf-8")),
		wranglertoml: await readFile(paths.wranglertoml, "utf-8"),
	};

	// update files
	contents.packagejson.name = ctx.project.name;
	contents.wranglertoml = contents.wranglertoml
		.replace(/^name = .+$/m, `name = "${ctx.project.name}"`)
		.replace(
			/^compatibility_date = .+$/m,
			`compatibility_date = "${new Date().toISOString().substring(0, 10)}"`
		);

	// write files
	await writeFile(
		paths.packagejson,
		JSON.stringify(contents.packagejson, null, 2)
	);
	await writeFile(paths.wranglertoml, contents.wranglertoml);
}
