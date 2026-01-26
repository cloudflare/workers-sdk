import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { Miniflare, MiniflareCoreError, stripAnsi } from "miniflare";
import { expect, test } from "vitest";
import { useCwd, useDispose, useTmp, utf8Encode } from "../../test-shared";

const ROOT = path.resolve(__dirname, "../../fixtures/modules");

test("Miniflare: accepts manually defined modules", async () => {
	// Check with just `path`
	const mf = new Miniflare({
		compatibilityDate: "2023-08-01",
		compatibilityFlags: ["nodejs_compat_v2"],
		// TODO(soon): remove `modulesRoot` once https://github.com/cloudflare/workerd/issues/1101 fixed
		//  and add separate test for that
		modulesRoot: ROOT,
		modules: [
			{ type: "ESModule", path: path.join(ROOT, "index.mjs") },
			{ type: "ESModule", path: path.join(ROOT, "blobs.mjs") },
			{ type: "ESModule", path: path.join(ROOT, "blobs-indirect.mjs") },
			{ type: "CommonJS", path: path.join(ROOT, "index.cjs") },
			{ type: "CommonJS", path: path.join(ROOT, "index.node.cjs") },
			// Testing modules in subdirectories
			{ type: "Text", path: path.join(ROOT, "blobs", "text.txt") },
			{ type: "Data", path: path.join(ROOT, "blobs", "data.bin") },
			{ type: "CompiledWasm", path: path.join(ROOT, "add.wasm") },
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
		compatibilityDate: "2023-08-01",
		compatibilityFlags: ["nodejs_compat_v2"],
		modules: [
			{ type: "ESModule", path: path.join(ROOT, "index.mjs") },
			{
				type: "ESModule",
				path: path.join(ROOT, "blobs.mjs"),
				contents: `
        import rawText from "./blobs/text.txt";
        export const text = "blobs:" + rawText;
        export { default as data } from "./blobs/data.bin";
        `,
			},
			{ type: "ESModule", path: path.join(ROOT, "blobs-indirect.mjs") },
			{
				type: "CommonJS",
				path: path.join(ROOT, "index.cjs"),
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
			{
				type: "CommonJS",
				path: path.join(ROOT, "index.node.cjs"),
				contents: `module.exports = "node:";`,
			},
			{
				type: "Text",
				path: path.join(ROOT, "blobs", "text.txt"),
				contents: "text",
			},
			{
				type: "Data",
				path: path.join(ROOT, "blobs", "data.bin"),
				contents: "data",
			},
			{
				type: "CompiledWasm",
				path: path.join(ROOT, "add.wasm"),
				contents: Buffer.from(subWasmModule, "base64"),
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
test("Miniflare: automatically collects modules", async () => {
	const mf = new Miniflare({
		modules: true,
		modulesRoot: ROOT,
		modulesRules: [
			// Implicitly testing default module rules for `ESModule`
			{ type: "CommonJS", include: ["**/*.node.cjs", "**/*.cjs"] },
			{ type: "Text", include: ["**/*.txt"] },
			{ type: "Data", include: ["**/*.bin"] },
			{ type: "CompiledWasm", include: ["**/*.wasm"] },
		],
		compatibilityDate: "2023-08-01",
		compatibilityFlags: ["nodejs_compat_v2"],
		scriptPath: path.join(ROOT, "index.mjs"),
	});
	useDispose(mf);
	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.json()).toEqual({
		text: "Hello! 👋\n",
		data: Array.from(utf8Encode("Hello! 🤖\n")),
		number: 3,
	});

	// Check validates module rules
	let error: MiniflareCoreError | undefined = undefined;
	try {
		await mf.setOptions({
			modules: true,
			// @ts-expect-error intentionally testing incorrect types
			modulesRules: [{ type: "PNG", include: ["**/*.png"] }],
			script: "",
		});
	} catch (e) {
		error = e as MiniflareCoreError;
	}
	expect(error).toBeInstanceOf(MiniflareCoreError);
	expect(error?.code).toBe("ERR_VALIDATION");
});
test("Miniflare: automatically collects modules with cycles", async () => {
	const mf = new Miniflare({
		modules: true,
		compatibilityDate: "2023-08-01",
		scriptPath: path.join(ROOT, "cyclic", "index.mjs"),
	});
	useDispose(mf);
	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("pong");
});
test("Miniflare: includes location in parse errors when automatically collecting modules", async () => {
	const scriptPath = path.join(ROOT, "syntax-error", "index.mjs");
	const mf = new Miniflare({
		modules: true,
		modulesRoot: ROOT,
		compatibilityDate: "2023-08-01",
		scriptPath,
		script: `export default {\n  new Response("body")\n}`,
	});
	await expect(mf.ready).rejects.toThrow(
		new MiniflareCoreError(
			"ERR_MODULE_PARSE",
			`Unable to parse "syntax-error/index.mjs": Unexpected keyword 'new' (2:2)
    at ${scriptPath}:2:2`
		)
	);
});
test("Miniflare: cannot automatically collect modules without script path", async () => {
	const script = `export default {
    async fetch() {
      return new Response("body");
    }
  }`;

	// Check can use modules `script`...
	const mf = new Miniflare({
		modules: true,
		compatibilityDate: "2023-08-01",
		script,
	});
	useDispose(mf);
	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("body");

	// ...but only if it doesn't import
	await expect(
		mf.setOptions({
			modules: true,
			compatibilityDate: "2023-08-01",
			script: `import dep from "./dep.mjs"; ${script}`,
		})
	).rejects.toThrow(
		new MiniflareCoreError(
			"ERR_MODULE_STRING_SCRIPT",
			'Unable to resolve "script-0" dependency: imports are unsupported in string `script` without defined `scriptPath`'
		)
	);
});
test("Miniflare: cannot automatically collect modules from dynamic import expressions", async () => {
	// Check with dynamic import
	const scriptPath = path.join(ROOT, "index-dynamic.mjs");
	let mf = new Miniflare({
		modules: true,
		modulesRoot: ROOT,
		modulesRules: [
			// Implicitly testing default module rules for `ESModule`
			{ type: "CommonJS", include: ["**/*.node.cjs", "**/*.cjs"] },
			{ type: "Text", include: ["**/*.txt"] },
			{ type: "Data", include: ["**/*.bin"] },
			{ type: "CompiledWasm", include: ["**/*.wasm"] },
		],
		compatibilityDate: "2023-08-01",
		compatibilityFlags: ["nodejs_compat_v2"],
		scriptPath,
	});

	let error: Error | undefined;
	try {
		await mf.ready;
	} catch (e) {
		error = e as Error;
	}
	assert(error !== undefined);
	// Check message includes currently collected modules
	let referencingPath = path.relative("", scriptPath);
	expect(stripAnsi(error.message))
		.toBe(`Unable to resolve "${referencingPath}" dependency: dynamic module specifiers are unsupported.
You must manually define your modules when constructing Miniflare:
  new Miniflare({
    ...,
    modules: [
      { type: "ESModule", path: "index-dynamic.mjs" },
      { type: "CommonJS", path: "index.cjs" },
      { type: "CommonJS", path: "index.node.cjs" },
      { type: "ESModule", path: "blobs-indirect.mjs" },
      { type: "ESModule", path: "blobs.mjs" },
      { type: "Text", path: "blobs/text.txt" },
      { type: "Data", path: "blobs/data.bin" },
      { type: "CompiledWasm", path: "add.wasm" },
      ...
    ]
  })
    at ${scriptPath}:14:15`);

	// Check with dynamic require
	mf = new Miniflare({
		modules: true,
		modulesRoot: ROOT,
		compatibilityDate: "2023-08-01",
		scriptPath,
		script: `import "./dynamic-require.cjs";
    export default {
      fetch() { return new Response(); }
    }`,
	});
	try {
		await mf.ready;
	} catch (e) {
		error = e as Error;
	}
	assert(error !== undefined);
	// Check message includes currently collected modules
	const depPath = path.join(ROOT, "dynamic-require.cjs");
	referencingPath = path.relative("", depPath);
	expect(stripAnsi(error.message))
		.toBe(`Unable to resolve "${referencingPath}" dependency: dynamic module specifiers are unsupported.
You must manually define your modules when constructing Miniflare:
  new Miniflare({
    ...,
    modules: [
      { type: "ESModule", path: "index-dynamic.mjs" },
      { type: "CommonJS", path: "dynamic-require.cjs" },
      ...
    ]
  })
    at ${depPath}:2:8`);
});
test("Miniflare: collects modules outside of working directory", async () => {
	// https://github.com/cloudflare/workers-sdk/issues/4721
	const tmp = await useTmp();
	const child = path.join(tmp, "child");
	await fs.mkdir(child);
	await fs.writeFile(
		path.join(tmp, "worker.mjs"),
		'export default { fetch() { return new Response("body"); } }'
	);
	useCwd(child);

	const mf = new Miniflare({
		modules: true,
		modulesRoot: "..",
		scriptPath: "../worker.mjs",
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("body");
});
test("Miniflare: suggests bundling on unknown module", async () => {
	// Try with npm-package-like import
	// (please don't try bundle `miniflare` into a Worker script, you'll hurt its feelings)
	let mf = new Miniflare({
		modules: true,
		compatibilityDate: "2023-08-01",
		scriptPath: "index.mjs",
		script: `import { Miniflare } from "miniflare";`,
	});
	await expect(mf.ready).rejects.toThrow(
		new MiniflareCoreError(
			"ERR_MODULE_RULE",
			`Unable to resolve "index.mjs" dependency "miniflare": no matching module rules.
If you're trying to import an npm package, you'll need to bundle your Worker first.`
		)
	);

	// Try with Node built-in module and `nodejs_compat` disabled
	mf = new Miniflare({
		modules: true,
		compatibilityDate: "2023-08-01",
		scriptPath: "index.mjs",
		script: `import assert from "node:assert";`,
	});
	let error: MiniflareCoreError | undefined = undefined;
	try {
		await mf.ready;
	} catch (e) {
		error = e as MiniflareCoreError;
	}
	expect(error?.code).toBe("ERR_MODULE_RULE");
	expect(error?.message).toMatch(
		/^Unable to resolve "index\.mjs" dependency "node:assert": no matching module rules\.\nIf you're trying to import a Node\.js built-in module, or an npm package that uses Node\.js built-ins, you'll either need to:/
	);
});
