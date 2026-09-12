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
