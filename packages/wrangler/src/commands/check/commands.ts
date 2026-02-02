import { randomUUID } from "node:crypto";
import events from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { log } from "@cloudflare/cli";
import { spinnerWhile } from "@cloudflare/cli/interactive";
import { UserError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { Miniflare } from "miniflare";
import { WebSocket } from "ws";
import { createCLIParser } from "../..";
import { createCommand, createNamespace } from "../../core/create-command";
import { moduleTypeMimeType } from "../../deployment-bundle/create-worker-upload-form";
import {
	flipObject,
	ModuleTypeToRuleType,
} from "../../deployment-bundle/module-collection";
import { logger } from "../../logger";
import { getWranglerTmpDir } from "../../paths";
import type { Config } from "@cloudflare/workers-utils";
import type { ModuleDefinition } from "miniflare";
import type { FormData, FormDataEntryValue } from "undici";

const mimeTypeModuleType = flipObject(moduleTypeMimeType);

export const checkNamespace = createNamespace({
	metadata: {
		description: "☑︎ Run checks on your Worker",
		owner: "Workers: Authoring and Testing",
		status: "alpha",
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
	const cpuProfileResult = await spinnerWhile({
		promise: analyseBundle(workerBundle),
		startMessage: "Analysing",
		endMessage: chalk.green("Startup phase analysed"),
	});

	await writeFile(outfile, JSON.stringify(await cpuProfileResult));

	log(
		[
			`CPU Profile has been written to ${outfile}. Load it into the Chrome DevTools profiler (or directly in VSCode) to view a flamegraph.`,
			"",
			"Note that the CPU Profile was measured on your Worker running locally on your machine, which has a different CPU than when your Worker runs on Cloudflare.",
			"",
			"As such, CPU Profile can be used to understand where time is spent at startup, but the overall startup time in the profile should not be expected to exactly match what your Worker's startup time will be when deploying to Cloudflare.",
		].join("\n")
	);
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
				"`--args` and `--worker` are mutually exclusive—please only specify one"
			);
		}

		if (args?.includes("outfile") || args?.includes("outdir")) {
			throw new UserError(
				"`--args` should not contain `--outfile` or `--outdir`"
			);
		}
	},
	metadata: {
		description: "⌛ Profile your Worker's startup performance",
		owner: "Workers: Authoring and Testing",
		status: "alpha",
	},
	handler: checkStartupHandler,
});

async function getEntryValue(
	entry: FormDataEntryValue
): Promise<Uint8Array | string> {
	if (entry instanceof Blob) {
		return new Uint8Array((await entry.arrayBuffer()) as ArrayBuffer);
	} else {
		return entry as string;
	}
}

function getModuleType(entry: FormDataEntryValue) {
	if (entry instanceof Blob) {
		const type = ModuleTypeToRuleType[mimeTypeModuleType[entry.type]];

		if (!type) {
			throw new Error(
				`Unable to determine module type for ${entry.type} mime type`
			);
		}

		return type;
	} else {
		return "Text";
	}
}

async function convertWorkerBundleToModules(
	workerBundle: FormData
): Promise<ModuleDefinition[]> {
	return await Promise.all(
		[...workerBundle.entries()]
			// Sourcemaps aren't "real" modules in the application and won't be imported by user code, so lets not load them when analyzing the bundle
			.filter(
				(m) => m[1] instanceof Blob && m[1].type !== "application/source-map"
			)
			.map(
				async (m) =>
					({
						type: getModuleType(m[1]),
						path: m[0],
						contents: await getEntryValue(m[1]),
					}) as ModuleDefinition
			)
	);
}

async function parseFormDataFromFile(file: string): Promise<FormData> {
	const bundle = await readFile(file);
	const firstLine = bundle.findIndex((v) => v === 10);
	const boundary = Uint8Array.prototype.slice
		.call(bundle, 2, firstLine)
		.toString();
	return await new Response(bundle, {
		headers: {
			"Content-Type": "multipart/form-data; boundary=" + boundary,
		},
	}).formData();
}

export async function analyseBundle(
	workerBundle: string | FormData
): Promise<Record<string, unknown>> {
	if (typeof workerBundle === "string") {
		workerBundle = await parseFormDataFromFile(workerBundle);
	}

	const metadata = JSON.parse(workerBundle.get("metadata") as string);

	if (!("main_module" in metadata)) {
		throw new UserError(
			"`wrangler check startup` does not support service-worker format Workers. Refer to https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/ for migration guidance."
		);
	}
	const mf = new Miniflare({
		name: "profiler",
		compatibilityDate: metadata.compatibility_date,
		compatibilityFlags: metadata.compatibility_flags,
		modulesRoot: "/",
		modules: [
			{
				type: "ESModule",
				// Make sure the entrypoint path doesn't conflict with a user worker module
				path: randomUUID(),
				contents: /* javascript */ `
					async function startup() {
						await import("${metadata.main_module}");
					}
					export default {
						async fetch() {
							await startup()
							return new Response("ok")
						}
					}
					`,
			},
			...(await convertWorkerBundleToModules(workerBundle)),
		],
		inspectorPort: 0,
	});
	await mf.ready;
	const inspectorUrl = await mf.getInspectorURL();
	const ws = new WebSocket(new URL("/core:user:profiler", inspectorUrl.href));
	await events.once(ws, "open");
	ws.send(JSON.stringify({ id: 1, method: "Profiler.enable", params: {} }));
	ws.send(JSON.stringify({ id: 2, method: "Profiler.start", params: {} }));

	const cpuProfileResult = new Promise<Record<string, unknown>>((accept) => {
		ws.addEventListener("message", (e) => {
			const data = JSON.parse(e.data as string);
			if (data.method === "Profiler.stop") {
				void mf.dispose().then(() => accept(data.result.profile));
			}
		});
	});

	await (await mf.dispatchFetch("https://example.com")).text();
	ws.send(JSON.stringify({ id: 3, method: "Profiler.stop", params: {} }));

	return cpuProfileResult;
}
