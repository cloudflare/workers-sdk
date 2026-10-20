import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { watch } from "rolldown";
import { afterEach, beforeEach, describe, it } from "vitest";
import { embedWorkersPlugin } from "../../../packages/remote-bindings/scripts/embed-workers";
import { bundleWorker } from "../bundle-worker.mjs";

describe("embedded Worker bundles", () => {
	let directory: string;
	beforeEach(async () => {
		directory = await realpath(
			await mkdtemp(path.join(tmpdir(), "embedded-worker-"))
		);
	});
	afterEach(async () => {
		// eslint-disable-next-line workers-sdk/no-direct-recursive-rm -- build-tool tests must also run before workers-utils has been built
		await rm(directory, { recursive: true, force: true });
	});

	it("tracks nested imports and rebuilds their contents", async ({
		expect,
	}) => {
		const entry = path.join(directory, "entry.ts");
		const dependency = path.join(directory, "dependency.ts");
		await writeFile(entry, 'export { value } from "./dependency";');
		await writeFile(dependency, 'export const value: string = "first-build";');
		const first = await bundleWorker({ input: entry });
		expect(first.watchFiles).toEqual(
			expect.arrayContaining([entry, dependency])
		);
		expect(first.code).toContain("first-build");
		await writeFile(dependency, 'export const value: string = "second-build";');
		const second = await bundleWorker({ input: entry });
		expect(second.code).toContain("second-build");
		expect(second.code).not.toContain("first-build");
	});

	it("keeps runtime builtins external and inlines dynamic imports", async ({
		expect,
	}) => {
		const entry = path.join(directory, "entry.ts");
		const output = path.join(directory, "worker.js");
		await writeFile(
			entry,
			`
			import { WorkerEntrypoint } from "cloudflare:workers";
			export default class extends WorkerEntrypoint {
				async fetch() { return new Response((await import("./dependency")).value); }
			}
		`
		);
		await writeFile(
			path.join(directory, "dependency.ts"),
			'export const value = "dynamic-value";'
		);
		const result = await bundleWorker({ input: entry }, { file: output });
		expect(result.code).toContain('"cloudflare:workers"');
		expect(result.code).toContain("dynamic-value");
		expect(result.code).not.toMatch(/import\(["']/);
		expect(await readFile(output, "utf8")).toBe(result.code);
	});

	it("rebuilds a parent bundle when a nested embedded Worker import changes", async ({
		expect,
	}) => {
		const parent = path.join(directory, "parent.ts");
		const worker = path.join(directory, "entry.ts");
		const dependency = path.join(directory, "dependency.ts");
		const output = path.join(directory, "parent.mjs");
		await writeFile(parent, 'export { default } from "worker:entry";');
		await writeFile(worker, 'export { value } from "./dependency";');
		await writeFile(dependency, 'export const value = "before-watch-update";');
		const watcher = watch({
			input: parent,
			plugins: [embedWorkersPlugin(directory)],
			output: { file: output, format: "esm" },
		});
		function nextBuild() {
			return new Promise<void>((resolve, reject) => {
				watcher.on("event", function onEvent(event) {
					if (event.code === "END" || event.code === "ERROR") {
						watcher.off("event", onEvent);
						if (event.code === "ERROR") {
							reject(event.error);
						} else {
							resolve();
						}
					}
				});
			});
		}
		try {
			await nextBuild();
			expect(await readFile(output, "utf8")).toContain("before-watch-update");
			const rebuilt = nextBuild();
			await writeFile(dependency, 'export const value = "after-watch-update";');
			await rebuilt;
			const code = await readFile(output, "utf8");
			expect(code).toContain("after-watch-update");
			expect(code).not.toContain("before-watch-update");
		} finally {
			await watcher.close();
		}
	});

	it("rejects invalid Workers instead of publishing partial output", async ({
		expect,
	}) => {
		const entry = path.join(directory, "entry.ts");
		await writeFile(entry, "export const = ;");
		await expect(
			bundleWorker({ input: entry, logLevel: "silent" })
		).rejects.toThrow();
	});
});
