import { randomUUID } from "node:crypto";
import events from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { log } from "@cloudflare/cli-shared-helpers";
import { spinnerWhile } from "@cloudflare/cli-shared-helpers/interactive";
import { getWranglerTmpDir, UserError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { WebSocket } from "ws";
import { createCLIParser } from "..";
import { createCommand, createNamespace } from "../core/create-command";
import { moduleTypeMimeType } from "../deployment-bundle/create-worker-upload-form";
import {
	flipObject,
	ModuleTypeToRuleType,
} from "../deployment-bundle/module-collection";
import { logger } from "../logger";
import type { Config } from "@cloudflare/workers-utils";
import type Protocol from "devtools-protocol";
import type { V4ModuleDefinition } from "miniflare";
import type { FormData, FormDataEntryValue } from "undici";

const mimeTypeModuleType = flipObject(moduleTypeMimeType);
const ONE_KIB_BYTES = 1024;

export interface StartupProfileSummary {
	profileWindow: number;
	sampledTime: number;
	activeTime: number;
	garbageCollectionTime: number;
	idleTime: number;
	sampleCount: number;
}

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
	const parsedWorkerBundle = await parseFormDataFromFile(workerBundle);
	const bundleSize = await getBundleSize(parsedWorkerBundle);
	const cpuProfileResult = await spinnerWhile({
		promise: analyseBundleProfile(parsedWorkerBundle),
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

async function getBundleSize(workerBundle: FormData) {
	const modules: Blob[] = [];
	for (const entry of workerBundle.values()) {
		if (entry instanceof Blob && entry.type !== "application/source-map") {
			modules.push(entry);
		}
	}
	const bundle = new Blob(modules);
	return {
		size: bundle.size,
		gzipSize: gzipSync(await bundle.arrayBuffer()).byteLength,
	};
}

export function summarizeStartupProfile(
	profile: Protocol.Profiler.Profile
): StartupProfileSummary {
	const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
	const samples = profile.samples ?? [];
	const timeDeltas = profile.timeDeltas ?? [];
	let sampledTime = 0;
	let idleTime = 0;
	let garbageCollectionTime = 0;

	for (const [index, timeDelta] of timeDeltas.entries()) {
		sampledTime += timeDelta;
		const functionName = nodes.get(samples[index] ?? 0)?.callFrame.functionName;
		if (functionName === "(idle)") {
			idleTime += timeDelta;
		} else if (functionName === "(garbage collector)") {
			garbageCollectionTime += timeDelta;
		}
	}

	return {
		profileWindow: profile.endTime - profile.startTime,
		sampledTime,
		activeTime: sampledTime - idleTime,
		garbageCollectionTime,
		idleTime,
		sampleCount: samples.length,
	};
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
): Promise<V4ModuleDefinition[]> {
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
					}) as V4ModuleDefinition
			)
	);
}

async function parseFormDataFromFile(file: string): Promise<FormData> {
	const bundle = await readFile(file);
	const firstLine = bundle.findIndex((v) => v === 10);
	const boundary = Uint8Array.prototype.slice
		.call(bundle, 2, firstLine)
		.toString();
	const response = new Response(bundle, {
		headers: {
			"Content-Type": "multipart/form-data; boundary=" + boundary,
		},
	});
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- formData() is the standard Web API; only deprecated on undici's server-side types
	return await response.formData();
}

export async function analyseBundle(
	workerBundle: string | FormData
): Promise<Record<string, unknown>> {
	return { ...(await analyseBundleProfile(workerBundle)) };
}

async function analyseBundleProfile(
	workerBundle: string | FormData
): Promise<Protocol.Profiler.Profile> {
	if (typeof workerBundle === "string") {
		workerBundle = await parseFormDataFromFile(workerBundle);
	}

	const metadata = JSON.parse(workerBundle.get("metadata") as string);

	if (!("main_module" in metadata)) {
		throw new UserError(
			"`wrangler check startup` does not support service-worker format Workers. Refer to https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/ for migration guidance.",
			{ telemetryMessage: "check startup service worker format unsupported" }
		);
	}
	const mf = new Miniflare(
		convertV4MiniflareOptions({
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
		})
	);
	await mf.ready;
	const inspectorUrl = await mf.getInspectorURL();
	const ws = new WebSocket(new URL("/core:user:profiler", inspectorUrl.href));
	await events.once(ws, "open");
	ws.send(JSON.stringify({ id: 1, method: "Profiler.enable", params: {} }));
	ws.send(JSON.stringify({ id: 2, method: "Profiler.start", params: {} }));

	const cpuProfileResult = new Promise<Protocol.Profiler.Profile>((accept) => {
		ws.addEventListener("message", (e) => {
			const data = JSON.parse(e.data as string) as {
				method?: string;
				result: { profile: Protocol.Profiler.Profile };
			};
			if (data.method === "Profiler.stop") {
				void mf.dispose().then(() => accept(data.result.profile));
			}
		});
	});

	await (await mf.dispatchFetch("https://example.com")).text();
	ws.send(JSON.stringify({ id: 3, method: "Profiler.stop", params: {} }));

	return cpuProfileResult;
}
