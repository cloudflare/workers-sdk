import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
	clearTimeout as clearNodeTimeout,
	setTimeout as setNodeTimeout,
} from "node:timers";
import { gzipSync } from "node:zlib";
import { UserError } from "@cloudflare/workers-utils";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { Response } from "undici";
import { WebSocket } from "ws";
import { fromMimeType } from "./deploy/helpers/create-worker-upload-form";
import type { CfModuleType } from "@cloudflare/workers-utils";
import type { Protocol } from "devtools-protocol";
import type { V4ModuleDefinition } from "miniflare";
import type { FormData, FormDataEntryValue } from "undici";
import type { RawData } from "ws";

const STARTUP_PROFILE_TIMEOUT_MS = 10_000;

const MODULE_TYPE_TO_MINIFLARE_TYPE: Record<
	CfModuleType,
	V4ModuleDefinition["type"]
> = {
	esm: "ESModule",
	commonjs: "CommonJS",
	"compiled-wasm": "CompiledWasm",
	buffer: "Data",
	text: "Text",
	python: "PythonModule",
	"python-requirement": "PythonRequirement",
};

export interface StartupProfileSummary {
	profileWindow: number;
	sampledTime: number;
	activeTime: number;
	garbageCollectionTime: number;
	idleTime: number;
	sampleCount: number;
}

/**
 * Parses a multipart Worker upload from disk, or returns an existing upload.
 *
 * @param workerBundle - A serialized upload path or an already parsed upload.
 * @returns The parsed multipart Worker upload.
 */
export async function parseWorkerBundle(
	workerBundle: string | FormData
): Promise<FormData> {
	if (typeof workerBundle !== "string") {
		return workerBundle;
	}

	const bundle = await readFile(workerBundle);
	const firstLine = bundle.findIndex((value) => value === 10);
	const boundary = Uint8Array.prototype.slice
		.call(bundle, 2, firstLine)
		.toString();
	const response = new Response(bundle, {
		headers: {
			"Content-Type": `multipart/form-data; boundary=${boundary}`,
		},
	});
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- formData() is the standard Web API; only deprecated on undici's server-side types
	return await response.formData();
}

/**
 * Measures the uncompressed and gzip-compressed size of a Worker upload.
 * Source maps and metadata are excluded from both measurements.
 *
 * @param workerBundle - A parsed multipart Worker upload.
 * @returns Raw and compressed byte counts.
 */
export async function getBundleSize(workerBundle: FormData): Promise<{
	size: number;
	gzipSize: number;
}> {
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

/**
 * Summarizes the timing samples in a Worker startup CPU profile.
 *
 * @param profile - A Chrome DevTools Protocol CPU profile.
 * @returns Aggregate startup, active, idle, and garbage-collection timings.
 */
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

/**
 * Runs a Worker upload locally and records its module-evaluation CPU profile.
 *
 * @param workerBundle - A serialized upload path or a parsed multipart upload.
 * @returns A Chrome DevTools Protocol CPU profile.
 */
export async function analyseBundle(
	workerBundle: string | FormData
): Promise<Protocol.Profiler.Profile> {
	const parsedWorkerBundle = await parseWorkerBundle(workerBundle);
	const metadata = JSON.parse(
		parsedWorkerBundle.get("metadata") as string
	) as Record<string, unknown>;

	if (typeof metadata.main_module !== "string") {
		throw new UserError(
			"Startup profiling does not support service-worker format Workers. Refer to https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/ for migration guidance.",
			{
				telemetryMessage: "startup profiling service worker format unsupported",
			}
		);
	}

	const mf = new Miniflare(
		convertV4MiniflareOptions({
			name: "profiler",
			compatibilityDate:
				typeof metadata.compatibility_date === "string"
					? metadata.compatibility_date
					: undefined,
			compatibilityFlags: Array.isArray(metadata.compatibility_flags)
				? (metadata.compatibility_flags as string[])
				: undefined,
			modulesRoot: "/",
			modules: [
				{
					type: "ESModule",
					// Keep the profiler entrypoint separate from all user module names.
					path: randomUUID(),
					contents: /* javascript */ `
					async function startup() {
						await import(${JSON.stringify(metadata.main_module)});
					}
					export default {
						async fetch() {
							await startup();
							return new Response("ok");
						}
					}
					`,
				},
				...(await convertWorkerBundleToModules(parsedWorkerBundle)),
			],
			inspectorPort: 0,
		})
	);
	const abortController = new AbortController();
	const timeout = setNodeTimeout(() => {
		abortController.abort(
			new UserError(
				`Worker startup profiling timed out after ${STARTUP_PROFILE_TIMEOUT_MS / 1000} seconds.`,
				{ telemetryMessage: "startup profiling timed out" }
			)
		);
	}, STARTUP_PROFILE_TIMEOUT_MS);

	let ws: WebSocket | undefined;
	const onInspectorError = (error: unknown) =>
		abortController.abort(
			error instanceof Error
				? error
				: new Error(`Worker startup profiler inspector error: ${String(error)}`)
		);
	const onInspectorClose = () =>
		abortController.abort(
			new Error("The Worker startup profiler inspector connection closed.")
		);

	try {
		await waitForPromise(mf.ready, abortController.signal);
		const inspectorUrl = await waitForPromise(
			mf.getInspectorURL(),
			abortController.signal
		);
		ws = new WebSocket(new URL("/core:user:profiler", inspectorUrl.href));
		ws.on("error", onInspectorError);
		ws.on("close", onInspectorClose);
		await waitForInspectorOpen(ws, abortController.signal);

		await sendInspectorCommand(
			ws,
			1,
			"Profiler.enable",
			abortController.signal
		);
		await sendInspectorCommand(ws, 2, "Profiler.start", abortController.signal);

		const response = await waitForPromise(
			mf.dispatchFetch("https://example.com", {
				signal: abortController.signal,
			}),
			abortController.signal
		);
		await waitForPromise(response.text(), abortController.signal);

		const stopResult = await sendInspectorCommand<{
			profile: Protocol.Profiler.Profile;
		}>(ws, 3, "Profiler.stop", abortController.signal);
		if (stopResult?.profile === undefined) {
			throw new Error("Inspector command Profiler.stop returned no profile.");
		}
		return stopResult.profile;
	} finally {
		try {
			await mf.dispose();
		} finally {
			try {
				if (ws !== undefined) {
					ws.off("error", onInspectorError);
					ws.off("close", onInspectorClose);
					if (ws.readyState !== WebSocket.CLOSED) {
						// Miniflare normally closes its inspector clients during disposal.
						// Terminate as a fallback if setup or disposal failed early.
						ws.once("error", () => undefined);
						ws.terminate();
					}
				}
			} finally {
				clearNodeTimeout(timeout);
			}
		}
	}
}

async function waitForPromise<T>(
	promise: Promise<T>,
	signal: AbortSignal
): Promise<T> {
	if (signal.aborted) {
		throw signal.reason;
	}

	return await new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
		void promise.then(resolve, reject).finally(() => {
			signal.removeEventListener("abort", onAbort);
		});
	});
}

async function waitForInspectorOpen(
	ws: WebSocket,
	signal: AbortSignal
): Promise<void> {
	if (signal.aborted) {
		throw signal.reason;
	}

	return await new Promise<void>((resolve, reject) => {
		const cleanup = () => {
			ws.off("open", onOpen);
			ws.off("error", onError);
			ws.off("close", onClose);
			signal.removeEventListener("abort", onAbort);
		};
		const onOpen = () => {
			cleanup();
			resolve();
		};
		const onError = (error: Error) => {
			cleanup();
			reject(error);
		};
		const onClose = () => {
			cleanup();
			reject(
				new Error("The Worker startup profiler inspector connection closed.")
			);
		};
		const onAbort = () => {
			cleanup();
			reject(signal.reason);
		};

		ws.once("open", onOpen);
		ws.once("error", onError);
		ws.once("close", onClose);
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

async function sendInspectorCommand<Result>(
	ws: WebSocket,
	id: number,
	method: string,
	signal: AbortSignal
): Promise<Result> {
	if (signal.aborted) {
		throw signal.reason;
	}

	return await new Promise<Result>((resolve, reject) => {
		const cleanup = () => {
			ws.off("message", onMessage);
			signal.removeEventListener("abort", onAbort);
		};
		const onMessage = (rawData: RawData) => {
			let message: {
				id?: number;
				result?: Result;
				error?: { code?: number; message?: string } | null;
			};
			try {
				message = JSON.parse(rawData.toString()) as typeof message;
			} catch (error) {
				cleanup();
				reject(error);
				return;
			}

			if (message.id !== id) {
				return;
			}

			cleanup();
			if (message.error != null) {
				reject(
					new Error(
						`Inspector command ${method} failed: ${message.error.message ?? `error ${message.error.code ?? "unknown"}`}`
					)
				);
				return;
			}
			resolve(message.result as Result);
		};
		const onAbort = () => {
			cleanup();
			reject(signal.reason);
		};

		ws.on("message", onMessage);
		signal.addEventListener("abort", onAbort, { once: true });
		try {
			ws.send(JSON.stringify({ id, method, params: {} }), (error) => {
				if (error) {
					cleanup();
					reject(error);
				}
			});
		} catch (error) {
			cleanup();
			reject(error);
		}
	});
}

async function getEntryValue(
	entry: FormDataEntryValue
): Promise<Uint8Array | string> {
	if (entry instanceof Blob) {
		return new Uint8Array((await entry.arrayBuffer()) as ArrayBuffer);
	}
	return entry as string;
}

function getModuleType(entry: FormDataEntryValue): V4ModuleDefinition["type"] {
	if (entry instanceof Blob) {
		try {
			return MODULE_TYPE_TO_MINIFLARE_TYPE[fromMimeType(entry.type)];
		} catch {
			throw new Error(
				`Unable to determine module type for ${entry.type} mime type`
			);
		}
	}
	return "Text";
}

async function convertWorkerBundleToModules(
	workerBundle: FormData
): Promise<V4ModuleDefinition[]> {
	return await Promise.all(
		[...workerBundle.entries()]
			// Source maps are upload metadata rather than importable Worker modules.
			.filter(
				(module) =>
					module[1] instanceof Blob &&
					module[1].type !== "application/source-map"
			)
			.map(
				async ([modulePath, entry]) =>
					({
						type: getModuleType(entry),
						path: modulePath,
						contents: await getEntryValue(entry),
					}) as V4ModuleDefinition
			)
	);
}
