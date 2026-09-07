import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { removeDirSync } from "@cloudflare/workers-utils";
import { Request } from "miniflare";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	decodeEncodedSpecifier,
	handleModuleFallbackRequest,
} from "../src/pool/module-fallback";
import {
	ENCODED_PATH_PREFIX,
	markCreateRequireUrl,
} from "../src/shared/module-path";
import type { Vite } from "vitest/node";

// The fallback handler only reads `vite.pluginContainer.resolveId`, and only
// when a specifier can't be resolved directly from the filesystem. Returning
// `null` mimics Vite failing to resolve, exercising the 404 fall-through.
function fakeVite(): Vite.ViteDevServer {
	return {
		pluginContainer: {
			resolveId: async () => null,
		},
	} as unknown as Vite.ViteDevServer;
}

// As above, but Vite resolves every specifier to `id`. Used to drive the
// handler to a specific `filePath` without touching the filesystem.
//
function fakeViteResolvingTo(id: string): Vite.ViteDevServer {
	return {
		pluginContainer: {
			resolveId: async () => ({ id }),
		},
	} as unknown as Vite.ViteDevServer;
}

/** Creates a Vite server stub that resolves selected specifiers. */
function fakeViteResolving(
	resolvedIds: Record<string, string>
): Vite.ViteDevServer {
	return {
		pluginContainer: {
			resolveId: async (specifier: string) => {
				const id = resolvedIds[specifier];
				return id === undefined ? null : { id };
			},
		},
	} as unknown as Vite.ViteDevServer;
}

/** Creates a Workerd V2 module fallback request. */
function v2ModuleFallbackRequest(options: {
	type: "import" | "require" | "internal";
	specifier: string;
	referrer: string;
	rawSpecifier?: string;
}): Request {
	return new Request("http://localhost/", {
		method: "POST",
		body: JSON.stringify(options),
	});
}

describe("markCreateRequireUrl", () => {
	it("marks and decodes file URLs containing spaces", ({ expect }) => {
		const url = "file:///a/my%20project/index.cjs";
		const markedPath = new URL(markCreateRequireUrl(url)).pathname;
		expect(markedPath.startsWith(ENCODED_PATH_PREFIX)).toBe(true);
		expect(decodeEncodedSpecifier(markedPath)).toBe("/a/my project/index.cjs");
	});

	it("preserves literal percent sequences", ({ expect }) => {
		const url = "file:///C:/my%20project/build%2520output/index.cjs";
		const markedPath = new URL(markCreateRequireUrl(url)).pathname;
		expect(decodeEncodedSpecifier(markedPath)).toBe(
			"/C:/my project/build%20output/index.cjs"
		);
	});

	it("leaves file URLs without encoded characters untouched", ({ expect }) => {
		const url = "file:///a/project/index.cjs";
		expect(markCreateRequireUrl(url)).toBe(url);
	});
});

describe("handleModuleFallbackRequest", () => {
	let tmp: string;

	beforeEach(() => {
		tmp = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "mf-fallback-v2-"))
		);
	});

	afterEach(() => {
		removeDirSync(tmp);
	});

	it("defers node:process to Workerd", async ({ expect }) => {
		const response = await handleModuleFallbackRequest(
			fakeVite(),
			v2ModuleFallbackRequest({
				type: "internal",
				specifier: "node:process",
				referrer: "file:///bundle/",
			})
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");
	});

	it("preserves canonical URLs and native import.meta in ES modules", async ({
		expect,
	}) => {
		const filePath = path.join(tmp, "module.mjs");
		const contents = "export default import.meta.url;";
		fs.writeFileSync(filePath, contents);
		const specifier = pathToFileURL(filePath).href;

		const response = await handleModuleFallbackRequest(
			fakeVite(),
			v2ModuleFallbackRequest({
				type: "import",
				specifier,
				rawSpecifier: "./module.mjs",
				referrer: pathToFileURL(path.join(tmp, "entry.mjs")).href,
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			name: specifier,
			esModule: contents,
		});
	});

	it("returns native CommonJS modules with their named exports", async ({
		expect,
	}) => {
		const filePath = path.join(tmp, "module.cjs");
		const contents = "exports.value = 42;";
		fs.writeFileSync(filePath, contents);
		const specifier = pathToFileURL(filePath).href;

		const response = await handleModuleFallbackRequest(
			fakeVite(),
			v2ModuleFallbackRequest({
				type: "import",
				specifier,
				rawSpecifier: "./module.cjs",
				referrer: pathToFileURL(path.join(tmp, "entry.mjs")).href,
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			name: specifier,
			commonJsModule: contents,
			namedExports: ["value"],
		});
	});

	it("preserves forced module types encoded in URL queries", async ({
		expect,
	}) => {
		const filePath = path.join(tmp, "module.txt");
		const contents = "plain text";
		fs.writeFileSync(filePath, contents);
		const specifier = `${pathToFileURL(filePath).href}?mf_vitest_force=Text`;

		const response = await handleModuleFallbackRequest(
			fakeVite(),
			v2ModuleFallbackRequest({
				type: "import",
				specifier,
				rawSpecifier: specifier,
				referrer: pathToFileURL(path.join(tmp, "entry.mjs")).href,
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			name: specifier,
			text: contents,
		});
	});

	it("uses module types selected by Vite", async ({ expect }) => {
		const filePath = path.join(tmp, "module.sql");
		const contents = "SELECT 1;";
		fs.writeFileSync(filePath, contents);
		const specifier = pathToFileURL(filePath).href;

		const response = await handleModuleFallbackRequest(
			fakeVite(),
			v2ModuleFallbackRequest({
				type: "import",
				specifier,
				rawSpecifier: `${filePath}?mf_vitest_force=Text`,
				referrer: pathToFileURL(path.join(tmp, "entry.mjs")).href,
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			name: specifier,
			text: contents,
		});
	});

	it("preserves query and fragment identity while reading the file path", async ({
		expect,
	}) => {
		const filePath = path.join(tmp, "module.mjs");
		const contents = "export const value = 42;";
		fs.writeFileSync(filePath, contents);
		const baseSpecifier = pathToFileURL(filePath).href;

		for (const suffix of ["?variant", "#one", "#two", "?variant#three"]) {
			const specifier = baseSpecifier + suffix;
			const response = await handleModuleFallbackRequest(
				fakeVite(),
				v2ModuleFallbackRequest({
					type: "import",
					specifier,
					rawSpecifier: `./module.mjs${suffix}`,
					referrer: pathToFileURL(path.join(tmp, "entry.mjs")).href,
				})
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				name: specifier,
				esModule: contents,
			});
		}
	});

	it("does not confuse an encoded hash in a filename with a URL fragment", async ({
		expect,
	}) => {
		const filePath = path.join(tmp, "dep#name.mjs");
		const contents = "export const value = 42;";
		fs.writeFileSync(filePath, contents);
		const specifier = `${pathToFileURL(filePath).href}?variant#instance`;

		const response = await handleModuleFallbackRequest(
			fakeVite(),
			v2ModuleFallbackRequest({
				type: "import",
				specifier,
				rawSpecifier: "./dep%23name.mjs?variant#instance",
				referrer: pathToFileURL(path.join(tmp, "entry.mjs")).href,
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			name: specifier,
			esModule: contents,
		});
	});

	it.skipIf(process.platform === "win32")(
		"does not confuse an encoded question mark in a filename with a URL query",
		async ({ expect }) => {
			const filePath = path.join(tmp, "dep?name.mjs");
			const contents = "export const value = 42;";
			fs.writeFileSync(filePath, contents);
			const specifier = pathToFileURL(filePath).href;

			const response = await handleModuleFallbackRequest(
				fakeVite(),
				v2ModuleFallbackRequest({
					type: "import",
					specifier,
					rawSpecifier: "./dep%3Fname.mjs",
					referrer: pathToFileURL(path.join(tmp, "entry.mjs")).href,
				})
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				name: specifier,
				esModule: contents,
			});
		}
	);

	it("preserves query and fragment identity in canonical redirects", async ({
		expect,
	}) => {
		const filePath = path.join(tmp, "module.mjs");
		const resolvedId = `${filePath}?variant#fragment`;

		const response = await handleModuleFallbackRequest(
			fakeViteResolvingTo(resolvedId),
			v2ModuleFallbackRequest({
				type: "import",
				specifier: "file:///bundle/module?variant#fragment",
				rawSpecifier: "module?variant#fragment",
				referrer: "file:///bundle/entry.mjs",
			})
		);

		expect(response.status).toBe(301);
		expect(response.headers.get("Location")).toBe(
			`${pathToFileURL(filePath).href}?variant#fragment`
		);
	});

	it("adapts required wasm modules without replacing the native module", async ({
		expect,
	}) => {
		const filePath = path.join(tmp, "module.wasm");
		fs.writeFileSync(filePath, "");
		const specifier = pathToFileURL(filePath).href;

		const response = await handleModuleFallbackRequest(
			fakeVite(),
			v2ModuleFallbackRequest({
				type: "require",
				specifier,
				rawSpecifier: "./module.wasm?module",
				referrer: pathToFileURL(path.join(tmp, "module.cjs")).href,
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			name: specifier,
			esModule: `import wasm from ${JSON.stringify(`${specifier}.__mf_vitest_compiled_wasm`)}; export default wasm;`,
		});
	});

	it("loads the native wasm module behind a require adapter", async ({
		expect,
	}) => {
		const filePath = path.join(tmp, "module.wasm");
		fs.writeFileSync(filePath, "wasm");
		const specifier = pathToFileURL(
			`${filePath}.__mf_vitest_compiled_wasm`
		).href;

		const response = await handleModuleFallbackRequest(
			fakeVite(),
			v2ModuleFallbackRequest({
				type: "import",
				specifier,
				rawSpecifier: specifier,
				referrer: `${pathToFileURL(filePath).href}?module`,
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			name: specifier,
			wasm: [119, 97, 115, 109],
		});
	});

	it("decodes marked createRequire URLs before resolving", async ({
		expect,
	}) => {
		const directory = path.join(tmp, "encoded path");
		const filePath = path.join(directory, "dependency.cjs");
		fs.mkdirSync(directory);
		fs.writeFileSync(filePath, "exports.value = 42;");

		const canonicalSpecifier = pathToFileURL(filePath).href;
		const response = await handleModuleFallbackRequest(
			fakeVite(),
			v2ModuleFallbackRequest({
				type: "require",
				specifier: markCreateRequireUrl(canonicalSpecifier),
				referrer: markCreateRequireUrl(
					pathToFileURL(path.join(directory, "index.cjs")).href
				),
			})
		);

		expect(response.status).toBe(301);
		expect(response.headers.get("Location")).toBe(canonicalSpecifier);
	});

	it("redirects aliases to canonical module URLs", async ({ expect }) => {
		const filePath = path.join(tmp, "package.mjs");

		const response = await handleModuleFallbackRequest(
			fakeViteResolvingTo(filePath),
			v2ModuleFallbackRequest({
				type: "import",
				specifier: "file:///bundle/package",
				rawSpecifier: "package",
				referrer: "file:///bundle/entry.mjs",
			})
		);

		expect(response.status).toBe(301);
		expect(response.headers.get("Location")).toBe(pathToFileURL(filePath).href);
	});

	it("reports readable module names when resolution fails", async ({
		expect,
	}) => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const response = await handleModuleFallbackRequest(
				fakeVite(),
				v2ModuleFallbackRequest({
					type: "import",
					specifier: "file:///bundle/missing?variant#instance",
					rawSpecifier: "missing?variant#instance",
					referrer: "file:///bundle/entry.mjs",
				})
			);

			expect(response.status).toBe(404);
			expect(errorSpy.mock.calls[0]?.[0]).toBe(
				'[vitest-plugin] Failed to import "/bundle/missing?variant#instance" from "/bundle/entry.mjs".'
			);
		} finally {
			errorSpy.mockRestore();
		}
	});

	it("preserves static and dynamic ES module dependencies", async ({
		expect,
	}) => {
		const filePath = path.join(tmp, "module.mjs");
		const contents = [
			'import value from "package";',
			'export const lazy = import("./lazy.mjs");',
		].join("\n");
		fs.writeFileSync(filePath, contents);

		const response = await handleModuleFallbackRequest(
			fakeVite(),
			v2ModuleFallbackRequest({
				type: "import",
				specifier: pathToFileURL(filePath).href,
				rawSpecifier: "./module.mjs",
				referrer: pathToFileURL(path.join(tmp, "entry.mjs")).href,
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			name: pathToFileURL(filePath).href,
			esModule: contents,
		});
	});

	it("links only the internal Vitest bootstrap graph", async ({ expect }) => {
		const snapshotPath = path.join(tmp, "snapshot.mjs");
		const vitestRuntimePath = path.join(tmp, "vitest-runtime.mjs");
		const contents = [
			'import assert from "node:assert";',
			'import { VitestSnapshotEnvironment } from "vitest/runtime";',
		].join("\n");
		fs.writeFileSync(snapshotPath, contents);

		const vite = fakeViteResolving({
			"cloudflare:snapshot": snapshotPath,
			"vitest/runtime": vitestRuntimePath,
		});
		const redirect = await handleModuleFallbackRequest(
			vite,
			v2ModuleFallbackRequest({
				type: "internal",
				specifier: "cloudflare:snapshot",
				referrer: "file:///bundle/entry.mjs",
			})
		);
		const canonicalSpecifier = pathToFileURL(snapshotPath).href;
		expect(redirect.status).toBe(301);
		expect(redirect.headers.get("Location")).toBe(canonicalSpecifier);

		const response = await handleModuleFallbackRequest(
			vite,
			v2ModuleFallbackRequest({
				type: "internal",
				specifier: canonicalSpecifier,
				referrer: "file:///bundle/entry.mjs",
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			name: canonicalSpecifier,
			esModule: [
				'import assert from "node:assert";',
				`import { VitestSnapshotEnvironment } from ${JSON.stringify(pathToFileURL(vitestRuntimePath).href)};`,
			].join("\n"),
		});
	});
});
