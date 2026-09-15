import { writeFile } from "node:fs/promises";
import path from "node:path";
import { log } from "@cloudflare/cli-shared-helpers";
import { spinnerWhile } from "@cloudflare/cli-shared-helpers/interactive";
import {
	analyseBundle,
	getBundleSize,
	parseWorkerBundle,
	summarizeStartupProfile,
} from "@cloudflare/deploy-helpers/startup-profile";
import { getWranglerTmpDir, UserError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { createCLIParser } from "..";
import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import type { Config } from "@cloudflare/workers-utils";

const ONE_KIB_BYTES = 1024;

export const checkNamespace = createNamespace({
	metadata: {
		description: "☑︎ Run checks on your Worker",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		hidden: true,
	},
});

async function checkStartupHandler(
	{
		outfile,
		args,
		workerBundle,
		pages,
	}: { outfile: string; args?: string; workerBundle?: string; pages?: boolean },
	{ config }: { config: Config }
) {
	if (workerBundle === undefined) {
		const tmpDir = getWranglerTmpDir(undefined, "startup-profile");
		workerBundle = path.join(tmpDir.path, "worker.bundle");

		if (config.pages_build_output_dir || pages) {
			log("Pages project detected");
			log("");
		}

		if (logger.loggerLevel !== "debug") {
			// Hide build logs
			logger.loggerLevel = "error";
		}

		await spinnerWhile({
			promise: async () => {
				const { wrangler } = createCLIParser(
					config.pages_build_output_dir || pages
						? [
								"pages",
								"functions",
								"build",
								...(args?.split(" ") ?? []),
								`--outfile=${workerBundle}`,
							]
						: [
								"deploy",
								...(args?.split(" ") ?? []),
								"--dry-run",
								`--outfile=${workerBundle}`,
							]
				);
				await wrangler.parse();
			},
			startMessage: "Building your Worker",
			endMessage: chalk.green("Worker Built! 🎉"),
		});
		logger.resetLoggerLevel();
	}
	const parsedWorkerBundle = await parseWorkerBundle(workerBundle);
	const bundleSize = await getBundleSize(parsedWorkerBundle);
	const cpuProfileResult = await spinnerWhile({
		promise: analyseBundle(parsedWorkerBundle),
		startMessage: "Analysing",
		endMessage: chalk.green("Startup phase analysed"),
	});
	const startupSummary = summarizeStartupProfile(cpuProfileResult);

	await writeFile(outfile, JSON.stringify(await cpuProfileResult));

	log(
		[
			`Bundle: ${(bundleSize.size / ONE_KIB_BYTES).toFixed(2)} KiB / gzip: ${(bundleSize.gzipSize / ONE_KIB_BYTES).toFixed(2)} KiB`,
			"",
			"Local startup profile:",
			`  Profile window: ${formatMicroseconds(startupSummary.profileWindow)}`,
			`  Sampled time: ${formatMicroseconds(startupSummary.sampledTime)}`,
			`  Active: ${formatMicroseconds(startupSummary.activeTime)} (including ${formatMicroseconds(startupSummary.garbageCollectionTime)} garbage collection)`,
			`  Idle: ${formatMicroseconds(startupSummary.idleTime)}`,
			`  Samples: ${startupSummary.sampleCount}`,
			"",
			`CPU Profile has been written to ${outfile}. Load it into the Chrome DevTools profiler (or directly in VSCode) to view a flamegraph.`,
			"",
			"Note that the CPU Profile was measured on your Worker running locally on your machine, which has a different CPU than when your Worker runs on Cloudflare.",
			"",
			"As such, CPU Profile can be used to understand where time is spent at startup, but the overall startup time in the profile should not be expected to exactly match what your Worker's startup time will be when deploying to Cloudflare.",
		].join("\n")
	);
}

function formatMicroseconds(microseconds: number): string {
	return `${(microseconds / 1000).toFixed(1)} ms`;
}

export const checkStartupCommand = createCommand({
	args: {
		outfile: {
			describe: "Output file for startup phase cpuprofile",
			type: "string",
			default: "worker-startup.cpuprofile",
		},
		workerBundle: {
			alias: "worker",
			describe:
				"Path to a prebuilt worker bundle i.e the output of `wrangler deploy --outfile worker.bundle",
			type: "string",
		},
		pages: {
			describe: "Force this project to be treated as a Pages project",
			type: "boolean",
		},
		args: {
			describe:
				"Additional arguments passed to `wrangler deploy` or `wrangler pages functions build` e.g. `--no-bundle`",
			type: "string",
		},
	},
	validateArgs({ args, workerBundle }) {
		if (workerBundle && args) {
			throw new UserError(
				"`--args` and `--worker` are mutually exclusive—please only specify one",
				{ telemetryMessage: "check startup args mutually exclusive" }
			);
		}

		if (args?.includes("outfile") || args?.includes("outdir")) {
			throw new UserError(
				"`--args` should not contain `--outfile` or `--outdir`",
				{ telemetryMessage: "check startup args output option disallowed" }
			);
		}
	},
	metadata: {
		description: "⌛ Profile your Worker's startup performance",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		suggestSkillsAfterHandler: true,
	},
	handler: checkStartupHandler,
});
