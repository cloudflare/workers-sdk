import fs from "node:fs/promises";
import path from "node:path";
import { Miniflare, MiniflareCoreError } from "miniflare";
import { test } from "vitest";
import {
	singleModuleManifest,
	useCwd,
	useDispose,
	useTmp,
	utf8Encode,
} from "../../test-shared";

const ROOT = path.resolve(__dirname, "../../fixtures/modules");

test("Miniflare: accepts manually defined modules", async ({ expect }) => {
	// Check with just `path` (contents read from disk and inlined into the
	// manifest). The manifest module names are the paths relative to the old
	// `modulesRoot` (which is removed in the new format).
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2023-08-01",
					compatibilityFlags: ["nodejs_compat_v2"],
					manifest: {
						mainModule: "index.mjs",
						modulesRoot: ROOT,
						modules: {
							"index.mjs": {
								type: "esm",
								contents: await fs.readFile(
									path.join(ROOT, "index.mjs"),
									"utf8"
								),
							},
							"blobs.mjs": {
								type: "esm",
								contents: await fs.readFile(
									path.join(ROOT, "blobs.mjs"),
									"utf8"
								),
							},
							"blobs-indirect.mjs": {
								type: "esm",
								contents: await fs.readFile(
									path.join(ROOT, "blobs-indirect.mjs"),
									"utf8"
								),
							},
							"index.cjs": {
								type: "cjs",
								contents: await fs.readFile(
									path.join(ROOT, "index.cjs"),
									"utf8"
								),
							},
							"index.node.cjs": {
								type: "cjs",
								contents: await fs.readFile(
									path.join(ROOT, "index.node.cjs"),
									"utf8"
								),
							},
							// Testing modules in subdirectories
							"blobs/text.txt": {
								type: "text",
								contents: await fs.readFile(
									path.join(ROOT, "blobs", "text.txt"),
									"utf8"
								),
							},
							"blobs/data.bin": {
								type: "data",
								contents: new Uint8Array(
									await fs.readFile(path.join(ROOT, "blobs", "data.bin"))
								),
							},
							"add.wasm": {
								type: "wasm",
								contents: new Uint8Array(
									await fs.readFile(path.join(ROOT, "add.wasm"))
								),
							},
						},
					},
				},
			},
		],
	});
	useDispose(mf);
	let res = await mf.dispatchFetch("http://localhost");
	expect(await res.json()).toEqual({
		text: "Hello! 👋\n",
		data: Array.from(utf8Encode("Hello! 🤖\n")),
		number: 3,
	});

	// Check with `contents` override
	// (base64 encoded module containing a single `add(i32, i32): i32` export that
	// actually subtracts :D)
	const subWasmModule =
		"AGFzbQEAAAABBwFgAn9/AX8DAgEABwcBA2FkZAAACgkBBwAgACABawsACgRuYW1lAgMBAAA=";
	await mf.setOptions({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2023-08-01",
					compatibilityFlags: ["nodejs_compat_v2"],
					manifest: {
						mainModule: "index.mjs",
						modulesRoot: ROOT,
						modules: {
							"index.mjs": {
								type: "esm",
								contents: await fs.readFile(
									path.join(ROOT, "index.mjs"),
									"utf8"
								),
							},
							"blobs.mjs": {
								type: "esm",
								contents: `
        import rawText from "./blobs/text.txt";
        export const text = "blobs:" + rawText;
        export { default as data } from "./blobs/data.bin";
        `,
							},
							"blobs-indirect.mjs": {
								type: "esm",
								contents: await fs.readFile(
									path.join(ROOT, "blobs-indirect.mjs"),
									"utf8"
								),
							},
							"index.cjs": {
								type: "cjs",
								contents: `const cjsNode = require("./index.node.cjs");
        module.exports = {
          base64Encode(data) {
            return "encoded:" + cjsNode + data;
          },
          base64Decode(data) {
            return "decoded:" + data;
          }
        };
        `,
							},
							"index.node.cjs": {
								type: "cjs",
								contents: `module.exports = "node:";`,
							},
							"blobs/text.txt": {
								type: "text",
								contents: "text",
							},
							"blobs/data.bin": {
								type: "data",
								contents: "data",
							},
							"add.wasm": {
								type: "wasm",
								contents: Buffer.from(subWasmModule, "base64"),
							},
						},
					},
				},
			},
		],
	});
	res = await mf.dispatchFetch("http://localhost");
	expect(await res.json()).toEqual({
		text: "decoded:encoded:node:blobs:text",
		data: Array.from(utf8Encode("data")),
		number: -1,
	});
});
test("Miniflare: automatically collects modules", async ({ expect }) => {
	// NOTE: `modulesRoot`/`modulesRules` auto-collection is removed in the new
	// format. The modules that would have been auto-collected from disk are
	// inlined into the manifest with explicit names instead.
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2023-08-01",
					compatibilityFlags: ["nodejs_compat_v2"],
					manifest: {
						mainModule: "index.mjs",
						modulesRoot: ROOT,
						modules: {
							"index.mjs": {
								type: "esm",
								contents: await fs.readFile(
									path.join(ROOT, "index.mjs"),
									"utf8"
								),
							},
							"blobs.mjs": {
								type: "esm",
								contents: await fs.readFile(
									path.join(ROOT, "blobs.mjs"),
									"utf8"
								),
							},
							"blobs-indirect.mjs": {
								type: "esm",
								contents: await fs.readFile(
									path.join(ROOT, "blobs-indirect.mjs"),
									"utf8"
								),
							},
							"index.cjs": {
								type: "cjs",
								contents: await fs.readFile(
									path.join(ROOT, "index.cjs"),
									"utf8"
								),
							},
							"index.node.cjs": {
								type: "cjs",
								contents: await fs.readFile(
									path.join(ROOT, "index.node.cjs"),
									"utf8"
								),
							},
							"blobs/text.txt": {
								type: "text",
								contents: await fs.readFile(
									path.join(ROOT, "blobs", "text.txt"),
									"utf8"
								),
							},
							"blobs/data.bin": {
								type: "data",
								contents: new Uint8Array(
									await fs.readFile(path.join(ROOT, "blobs", "data.bin"))
								),
							},
							"add.wasm": {
								type: "wasm",
								contents: new Uint8Array(
									await fs.readFile(path.join(ROOT, "add.wasm"))
								),
							},
						},
					},
				},
			},
		],
	});
	useDispose(mf);
	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.json()).toEqual({
		text: "Hello! 👋\n",
		data: Array.from(utf8Encode("Hello! 🤖\n")),
		number: 3,
	});

	// Check validates module types. In the old format this exercised
	// `modulesRules` validation; the closest faithful analog in the new format
	// is validating the manifest module `type` enum.
	let error: MiniflareCoreError | undefined = undefined;
	try {
		await mf.setOptions({
			workers: [
				{
					config: {
						type: "worker",
						name: "",
						compatibilityDate: "2023-08-01",
						manifest: {
							mainModule: "index.mjs",
							modulesRoot: ROOT,
							modules: {
								// @ts-expect-error intentionally testing incorrect types
								"index.mjs": { type: "PNG", contents: "" },
							},
						},
					},
				},
			],
		});
	} catch (e) {
		error = e as MiniflareCoreError;
	}
	expect(error).toBeInstanceOf(MiniflareCoreError);
	expect(error?.code).toBe("ERR_VALIDATION");
});
test("Miniflare: automatically collects modules with cycles", async ({
	expect,
}) => {
	// Cyclic modules inlined into the manifest (auto-collection removed).
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2023-08-01",
					manifest: {
						mainModule: "index.mjs",
						modulesRoot: path.join(ROOT, "cyclic"),
						modules: {
							"index.mjs": {
								type: "esm",
								contents: await fs.readFile(
									path.join(ROOT, "cyclic", "index.mjs"),
									"utf8"
								),
							},
							"cyclic1.mjs": {
								type: "esm",
								contents: await fs.readFile(
									path.join(ROOT, "cyclic", "cyclic1.mjs"),
									"utf8"
								),
							},
							"cyclic2.mjs": {
								type: "esm",
								contents: await fs.readFile(
									path.join(ROOT, "cyclic", "cyclic2.mjs"),
									"utf8"
								),
							},
						},
					},
				},
			},
		],
	});
	useDispose(mf);
	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("pong");
});
test("Miniflare: collects modules outside of working directory", async ({
	expect,
}) => {
	// https://github.com/cloudflare/workers-sdk/issues/4721
	// NOTE: The original test exercised `modulesRoot: ".."` path resolution for
	// modules outside the cwd, which is removed in the new format. The module
	// contents are read and inlined into the manifest instead; the
	// outside-cwd path-resolution behaviour is no longer exercised.
	const tmp = await useTmp();
	const child = path.join(tmp, "child");
	await fs.mkdir(child);
	await fs.writeFile(
		path.join(tmp, "worker.mjs"),
		'export default { fetch() { return new Response("body"); } }'
	);
	useCwd(child);

	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(
						await fs.readFile(path.join(tmp, "worker.mjs"), "utf8")
					),
				},
			},
		],
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("body");
});
test("Miniflare: parses scripts containing `using` declarations", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2023-08-01",
					manifest: singleModuleManifest(`export default {
  async fetch() {
    using handle = { [Symbol.dispose]() {} };
    void handle;
    return new Response("using parsed successfully");
  }
};`),
				},
			},
		],
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("using parsed successfully");
});
test("Miniflare: parses scripts containing `await using` declarations", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2023-08-01",
					manifest: singleModuleManifest(`export default {
  async fetch() {
    await using handle = { async [Symbol.asyncDispose]() {} };
    void handle;
    return new Response("await using parsed successfully");
  }
};`),
				},
			},
		],
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("await using parsed successfully");
});
test("Miniflare: parses source phase imports without error", async ({
	expect,
}) => {
	// NOTE: The original test used `modulesRoot`/`modulesRules` auto-collection
	// to load the worker + wasm from disk. Auto-collection is removed, so both
	// modules are inlined into the manifest instead.
	const tmp = await useTmp();
	const wasmPath = path.join(tmp, "module.wasm");

	// Create a minimal wasm file
	await fs.writeFile(
		wasmPath,
		Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
	);

	// Verify the worker can be loaded without parse errors
	// Note: workerd doesn't actually support source phase imports at runtime,
	// but we need to ensure the parser doesn't fail on the syntax
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2023-08-01",
					manifest: {
						mainModule: "index.mjs",
						modulesRoot: tmp,
						modules: {
							"index.mjs": {
								type: "esm",
								contents: `import source wasmModule from "./module.wasm";
export default {
  async fetch() {
    return new Response("source phase import parsed successfully");
  }
};`,
							},
							"module.wasm": {
								type: "wasm",
								contents: new Uint8Array(await fs.readFile(wasmPath)),
							},
						},
					},
				},
			},
		],
	});
	useDispose(mf);

	// The worker should be able to load (even if the source phase import
	// is not fully functional at runtime)
	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("source phase import parsed successfully");
});
