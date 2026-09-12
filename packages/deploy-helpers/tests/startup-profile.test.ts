import { Buffer } from "node:buffer";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	analyseBundle,
	getBundleSize,
	parseWorkerBundle,
	summarizeStartupProfile,
} from "@cloudflare/deploy-helpers/startup-profile";
import { removeDir } from "@cloudflare/workers-utils";
import { mockConsoleMethods } from "@cloudflare/workers-utils/test-helpers";
import { FormData, Request } from "undici";
import { describe, it } from "vitest";

// A fixed workload makes successful binding checks visible in the sampled
// profile. Workerd freezes wall-clock time during JavaScript execution, so a
// time-bounded loop could never finish.
const PROFILE_MARKER_ITERATIONS = 10_000_000;
const BINDINGS_AVAILABLE_FUNCTION = "markBindingsAvailable";
const BINDINGS_AVAILABLE_PROFILE_MARKER = /* javascript */ `
	function ${BINDINGS_AVAILABLE_FUNCTION}() {
		let marker = 0;
		for (let index = 0; index < ${PROFILE_MARKER_ITERATIONS}; index++) {
			marker = Math.imul(marker ^ index, 0x45d9f3b);
		}
		return marker;
	}
	export const bindingsAvailableMarker = ${BINDINGS_AVAILABLE_FUNCTION}();
`;

describe("startup profile", () => {
	const std = mockConsoleMethods();

	it("profiles a multipart module Worker without forwarding startup logs", async ({
		expect,
	}) => {
		const source = `
			console.log("__STARTUP_LOG__");
			export default { fetch() { return new Response("ok"); } };
		`;
		const workerBundle = new FormData();
		workerBundle.set(
			"metadata",
			JSON.stringify({
				main_module: "index.js",
				compatibility_date: "2025-01-01",
			})
		);
		workerBundle.set(
			"index.js",
			new File([source], "index.js", {
				type: "application/javascript+module",
			})
		);

		const profile = await analyseBundle(workerBundle);

		expect(profile.nodes.length).toBeGreaterThan(0);
		expect(profile.endTime).toBeGreaterThanOrEqual(profile.startTime);
		expect(std.out).not.toContain("__STARTUP_LOG__");
	});

	it("makes upload bindings available during module evaluation", async ({
		expect,
	}) => {
		const source = /* javascript */ `
			import { env } from "cloudflare:workers";
			if (env.STARTUP_TEXT !== "available") {
				throw new Error("STARTUP_TEXT was not available");
			}
			if (env.STARTUP_JSON.enabled !== true) {
				throw new Error("STARTUP_JSON was not available");
			}
			${BINDINGS_AVAILABLE_PROFILE_MARKER}
			export default { fetch() { return new Response("ok"); } };
		`;
		const workerBundle = new FormData();
		workerBundle.set(
			"metadata",
			JSON.stringify({
				main_module: "index.js",
				bindings: [
					{ name: "STARTUP_TEXT", type: "plain_text", text: "available" },
					{ name: "STARTUP_JSON", type: "json", json: { enabled: true } },
				],
			})
		);
		workerBundle.set(
			"index.js",
			new File([source], "index.js", {
				type: "application/javascript+module",
			})
		);

		const profile = await analyseBundle(workerBundle);

		expect(
			profile.nodes.map(({ callFrame }) => callFrame.functionName)
		).toContain(BINDINGS_AVAILABLE_FUNCTION);
	});

	it("makes resource bindings available during module evaluation", async ({
		expect,
	}) => {
		const source = /* javascript */ `
			import { env } from "cloudflare:workers";
			const expectedMethods = {
				STARTUP_KV: "get",
				STARTUP_D1: "prepare",
				STARTUP_R2: "get",
				STARTUP_QUEUE: "send",
				STARTUP_SERVICE: "fetch",
				STARTUP_RAW_KV: "fetch",
				STARTUP_RAW_VECTORIZE: "fetch",
			};
			for (const [bindingName, methodName] of Object.entries(expectedMethods)) {
				if (typeof env[bindingName]?.[methodName] !== "function") {
					throw new Error(bindingName + " was not available");
				}
			}
			${BINDINGS_AVAILABLE_PROFILE_MARKER}
			export default { fetch() { return new Response("ok"); } };
		`;
		const workerBundle = new FormData();
		workerBundle.set(
			"metadata",
			JSON.stringify({
				main_module: "index.js",
				bindings: [
					{
						name: "STARTUP_KV",
						type: "kv_namespace",
						namespace_id: "startup-kv",
					},
					{ name: "STARTUP_D1", type: "d1", id: "startup-d1" },
					{
						name: "STARTUP_R2",
						type: "r2_bucket",
						bucket_name: "startup-r2",
					},
					{
						name: "STARTUP_QUEUE",
						type: "queue",
						queue_name: "startup-queue",
					},
					{
						name: "STARTUP_SERVICE",
						type: "service",
						service: "startup-service",
					},
					{
						name: "STARTUP_RAW_KV",
						type: "kv_namespace",
						namespace_id: "startup-raw-kv",
						raw: true,
					},
					{
						name: "STARTUP_RAW_VECTORIZE",
						type: "vectorize",
						index_name: "startup-raw-vectorize",
						raw: true,
					},
				],
			})
		);
		workerBundle.set(
			"index.js",
			new File([source], "index.js", {
				type: "application/javascript+module",
			})
		);

		const profile = await analyseBundle(workerBundle);

		expect(
			profile.nodes.map(({ callFrame }) => callFrame.functionName)
		).toContain(BINDINGS_AVAILABLE_FUNCTION);
	});

	it("makes representable product bindings available during module evaluation", async ({
		expect,
	}) => {
		const bindingNames = [
			"STARTUP_BROWSER",
			"STARTUP_AI",
			"STARTUP_IMAGES",
			"STARTUP_STREAM",
			"STARTUP_VERSION",
			"STARTUP_AI_SEARCH_NAMESPACE",
			"STARTUP_AI_SEARCH",
			"STARTUP_WEBSEARCH",
			"STARTUP_AGENT_MEMORY",
			"STARTUP_MEDIA",
			"STARTUP_EMAIL",
			"STARTUP_VECTORIZE",
			"STARTUP_ANALYTICS",
			"STARTUP_DISPATCH",
			"STARTUP_MTLS",
			"STARTUP_PIPELINE",
			"STARTUP_SECRET",
			"STARTUP_ARTIFACTS",
			"STARTUP_HELLO_WORLD",
			"STARTUP_FLAGSHIP",
			"STARTUP_RATELIMIT",
			"STARTUP_VPC_SERVICE",
			"STARTUP_VPC_NETWORK",
			"STARTUP_WORKER_LOADER",
			"STARTUP_ASSETS",
		];
		const source = /* javascript */ `
			import { env } from "cloudflare:workers";
			for (const bindingName of ${JSON.stringify(bindingNames)}) {
				if (env[bindingName] === undefined) {
					throw new Error(bindingName + " was not available");
				}
			}
			${BINDINGS_AVAILABLE_PROFILE_MARKER}
			export default { fetch() { return new Response("ok"); } };
		`;
		const workerBundle = new FormData();
		workerBundle.set(
			"metadata",
			JSON.stringify({
				main_module: "index.js",
				compatibility_date: "2025-01-01",
				bindings: [
					{ name: "STARTUP_BROWSER", type: "browser" },
					{ name: "STARTUP_AI", type: "ai" },
					{ name: "STARTUP_IMAGES", type: "images" },
					{ name: "STARTUP_STREAM", type: "stream" },
					{ name: "STARTUP_VERSION", type: "version_metadata" },
					{
						name: "STARTUP_AI_SEARCH_NAMESPACE",
						type: "ai_search_namespace",
						namespace: "startup-namespace",
					},
					{
						name: "STARTUP_AI_SEARCH",
						type: "ai_search",
						instance_name: "startup-instance",
					},
					{ name: "STARTUP_WEBSEARCH", type: "websearch" },
					{
						name: "STARTUP_AGENT_MEMORY",
						type: "agent_memory",
						namespace: "startup-memory",
					},
					{ name: "STARTUP_MEDIA", type: "media" },
					{ name: "STARTUP_EMAIL", type: "send_email" },
					{
						name: "STARTUP_VECTORIZE",
						type: "vectorize",
						index_name: "startup-index",
					},
					{
						name: "STARTUP_ANALYTICS",
						type: "analytics_engine",
						dataset: "startup-dataset",
					},
					{
						name: "STARTUP_DISPATCH",
						type: "dispatch_namespace",
						namespace: "startup-dispatch",
					},
					{
						name: "STARTUP_MTLS",
						type: "mtls_certificate",
						certificate_id: "startup-certificate",
					},
					{
						name: "STARTUP_PIPELINE",
						type: "pipelines",
						pipeline: "startup-pipeline",
					},
					{
						name: "STARTUP_SECRET",
						type: "secrets_store_secret",
						store_id: "startup-store",
						secret_name: "startup-secret",
					},
					{
						name: "STARTUP_ARTIFACTS",
						type: "artifacts",
						namespace: "startup-artifacts",
					},
					{ name: "STARTUP_HELLO_WORLD", type: "unsafe_hello_world" },
					{
						name: "STARTUP_FLAGSHIP",
						type: "flagship",
						app_id: "startup-app",
					},
					{
						name: "STARTUP_RATELIMIT",
						type: "ratelimit",
						namespace_id: "startup-ratelimit",
						simple: { limit: 10, period: 60 },
					},
					{
						name: "STARTUP_VPC_SERVICE",
						type: "vpc_service",
						service_id: "startup-vpc-service",
					},
					{
						name: "STARTUP_VPC_NETWORK",
						type: "vpc_network",
						network_id: "startup-vpc-network",
					},
					{ name: "STARTUP_WORKER_LOADER", type: "worker_loader" },
					{ name: "STARTUP_ASSETS", type: "assets" },
				],
			})
		);
		workerBundle.set(
			"index.js",
			new File([source], "index.js", {
				type: "application/javascript+module",
			})
		);

		const profile = await analyseBundle(workerBundle);

		expect(
			profile.nodes.map(({ callFrame }) => callFrame.functionName)
		).toContain(BINDINGS_AVAILABLE_FUNCTION);
	});

	it("makes multipart blob bindings available during module evaluation", async ({
		expect,
	}) => {
		const source = /* javascript */ `
			import { env } from "cloudflare:workers";
			if (env.STARTUP_TEXT_BLOB !== "startup text") {
				throw new Error("STARTUP_TEXT_BLOB was not available");
			}
			if (new Uint8Array(env.STARTUP_DATA_BLOB).join(",") !== "1,2,3") {
				throw new Error("STARTUP_DATA_BLOB was not available");
			}
			${BINDINGS_AVAILABLE_PROFILE_MARKER}
			export default { fetch() { return new Response("ok"); } };
		`;
		const workerBundle = new FormData();
		workerBundle.set(
			"metadata",
			JSON.stringify({
				main_module: "index.js",
				bindings: [
					{
						name: "STARTUP_TEXT_BLOB",
						type: "text_blob",
						part: "startup.txt",
					},
					{
						name: "STARTUP_DATA_BLOB",
						type: "data_blob",
						part: "startup.bin",
					},
				],
			})
		);
		workerBundle.set(
			"index.js",
			new File([source], "index.js", {
				type: "application/javascript+module",
			})
		);
		workerBundle.set(
			"startup.txt",
			new File(["startup text"], "startup.txt", { type: "text/plain" })
		);
		workerBundle.set(
			"startup.bin",
			new File([new Uint8Array([1, 2, 3])], "startup.bin", {
				type: "application/octet-stream",
			})
		);
		const profile = await analyseBundle(workerBundle);

		expect(
			profile.nodes.map(({ callFrame }) => callFrame.functionName)
		).toContain(BINDINGS_AVAILABLE_FUNCTION);
	});

	it("allows unused upload bindings whose runtime type cannot be reconstructed", async ({
		expect,
	}) => {
		const workerBundle = new FormData();
		workerBundle.set(
			"metadata",
			JSON.stringify({
				main_module: "index.js",
				bindings: [
					{ name: "INHERITED", type: "inherit" },
					{
						name: "STARTUP_DO",
						type: "durable_object_namespace",
						class_name: "StartupDurableObject",
					},
					{
						name: "STARTUP_WORKFLOW",
						type: "workflow",
						workflow_name: "startup-workflow",
						class_name: "StartupWorkflow",
					},
					{
						name: "STARTUP_WASM",
						type: "wasm_module",
						part: "startup.wasm",
					},
				],
			})
		);
		workerBundle.set(
			"index.js",
			new File(
				["export default { fetch() { return new Response('ok'); } };"],
				"index.js",
				{ type: "application/javascript+module" }
			)
		);
		workerBundle.set(
			"startup.wasm",
			new File(
				[new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])],
				"startup.wasm",
				{ type: "application/wasm" }
			)
		);

		const profile = await analyseBundle(workerBundle);
		expect(profile.nodes.length).toBeGreaterThan(0);
	});

	it("identifies unreconstructable bindings after module evaluation fails", async ({
		expect,
	}) => {
		const workerBundle = new FormData();
		workerBundle.set(
			"metadata",
			JSON.stringify({
				main_module: "index.js",
				bindings: [{ name: "INHERITED", type: "inherit" }],
			})
		);
		workerBundle.set(
			"index.js",
			new File(
				[
					`import { env } from "cloudflare:workers";
					if (env.INHERITED === undefined) throw new Error("missing binding");`,
				],
				"index.js",
				{ type: "application/javascript+module" }
			)
		);

		await expect(analyseBundle(workerBundle)).rejects.toThrow(
			'The upload contains bindings that cannot be reproduced locally during startup profiling: "INHERITED" ("inherit").'
		);
	});

	it("profiles failed module evaluation without exposing its error", async ({
		expect,
	}) => {
		const secret = "PRIVATE_STARTUP_VALUE";
		const failureFunction = "failModuleEvaluation";
		const workerBundle = new FormData();
		workerBundle.set("metadata", JSON.stringify({ main_module: "index.js" }));
		workerBundle.set(
			"index.js",
			new File(
				[
					`function ${failureFunction}() {
						let marker = 0;
						for (let index = 0; index < ${PROFILE_MARKER_ITERATIONS}; index++) {
							marker = Math.imul(marker ^ index, 0x45d9f3b);
						}
						throw new Error("${secret} " + marker + " /private/index.js");
					}
					${failureFunction}();`,
				],
				"index.js",
				{
					type: "application/javascript+module",
				}
			)
		);

		const profile = await analyseBundle(workerBundle);

		expect(
			profile.nodes.map(({ callFrame }) => callFrame.functionName)
		).toContain(failureFunction);
		const consoleOutput = [
			std.debug,
			std.out,
			std.info,
			std.err,
			std.warn,
		].join("\n");
		expect(consoleOutput).not.toContain(secret);
		expect(consoleOutput).not.toContain("/private/index.js");
	});

	it("rejects service-worker format Workers", async ({ expect }) => {
		const workerBundle = new FormData();
		workerBundle.set("metadata", JSON.stringify({ body_part: "index.js" }));
		workerBundle.set(
			"index.js",
			new File(["addEventListener('fetch', () => {});"], "index.js", {
				type: "application/javascript",
			})
		);

		await expect(analyseBundle(workerBundle)).rejects.toThrow(
			"Startup profiling does not support service-worker format Workers."
		);
	});

	it("returns undici FormData when parsing a saved bundle", async ({
		expect,
	}) => {
		const source = "export default { fetch() { return new Response('ok'); } };";
		const workerBundle = new FormData();
		workerBundle.set("metadata", JSON.stringify({ main_module: "index.js" }));
		workerBundle.set(
			"index.js",
			new File([source], "index.js", {
				type: "application/javascript+module",
			})
		);
		const serializedUpload = new Request("https://example.com", {
			method: "POST",
			body: workerBundle,
		});
		const tempDirectory = await mkdtemp(
			path.join(tmpdir(), "deploy-helpers-startup-profile-")
		);

		try {
			const bundlePath = path.join(tempDirectory, "worker.bundle");
			await writeFile(
				bundlePath,
				Buffer.from(await serializedUpload.arrayBuffer())
			);

			const parsedBundle = await parseWorkerBundle(bundlePath);
			expect(parsedBundle).toBeInstanceOf(FormData);

			const reserializedUpload = new Request("https://example.com", {
				method: "POST",
				body: parsedBundle,
			});
			expect(reserializedUpload.headers.get("content-type")).toMatch(
				/^multipart\/form-data; boundary=/
			);
			await expect(reserializedUpload.text()).resolves.toContain(source);
		} finally {
			await removeDir(tempDirectory);
		}
	});

	it("excludes metadata and source maps from bundle size", async ({
		expect,
	}) => {
		const source = "export default {};";
		const workerBundle = new FormData();
		workerBundle.set("metadata", JSON.stringify({ main_module: "index.js" }));
		workerBundle.set(
			"index.js",
			new File([source], "index.js", {
				type: "application/javascript+module",
			})
		);
		workerBundle.set(
			"index.js.map",
			new File(["source map"], "index.js.map", {
				type: "application/source-map",
			})
		);

		expect(await getBundleSize(workerBundle)).toMatchObject({
			size: Buffer.byteLength(source),
		});
	});

	it("separates active, garbage collection, and idle samples", ({ expect }) => {
		expect(
			summarizeStartupProfile({
				nodes: [
					{
						id: 1,
						callFrame: {
							functionName: "(idle)",
							scriptId: "0",
							url: "",
							lineNumber: -1,
							columnNumber: -1,
						},
					},
					{
						id: 2,
						callFrame: {
							functionName: "(garbage collector)",
							scriptId: "0",
							url: "",
							lineNumber: -1,
							columnNumber: -1,
						},
					},
					{
						id: 3,
						callFrame: {
							functionName: "startup",
							scriptId: "1",
							url: "index.js",
							lineNumber: 0,
							columnNumber: 0,
						},
					},
				],
				startTime: 1_000,
				endTime: 8_000,
				samples: [1, 2, 3],
				timeDeltas: [1_000, 2_000, 3_000],
			})
		).toEqual({
			profileWindow: 7_000,
			sampledTime: 6_000,
			activeTime: 5_000,
			garbageCollectionTime: 2_000,
			idleTime: 1_000,
			sampleCount: 3,
		});
	});
});
