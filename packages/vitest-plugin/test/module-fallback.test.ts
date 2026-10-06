import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { removeDirSync } from "@cloudflare/workers-utils";
import { Request } from "miniflare";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	decodeEncodedSpecifier,
	encodeRedirectLocation,
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
// Note the built-in module list is a build-time define, stubbed to `[]` for
// these unit tests (see `vitest.config.mts`), so the `workerdBuiltinModules`
// branch in `resolve()` can't be exercised here. Resolving through Vite to the
// same rooted path that branch would have produced reaches the same place.
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

function moduleFallbackRequest(options: {
	method: "import" | "require";
	specifier: string;
	referrer: string;
	rawSpecifier?: string;
}): Request {
	const url = new URL("http://localhost/");
	// `URLSearchParams` handles transport encoding, so the handler reads back the
	// exact `specifier`/`referrer` string — just as it would from `workerd`.
	url.searchParams.set("specifier", options.specifier);
	url.searchParams.set("referrer", options.referrer);
	if (options.rawSpecifier !== undefined) {
		url.searchParams.set("rawSpecifier", options.rawSpecifier);
	}
	return new Request(url.href, {
		headers: { "X-Resolve-Method": options.method },
	});
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

// `workerd` hands the fallback service POSIX-style, root-anchored specifiers,
// even on Windows: a real path like `C:\a\b` arrives as `/C:/a/b`. The handler
// relies on that shape (it runs `posixPath.dirname()` on the referrer and only
// strips a *leading* slash to recover a Windows `fs` path). Building request
// inputs with `path.join()` would send backslash, un-rooted paths on Windows
// and diverge from production, so mirror workerd's transform here.
function toWorkerdSpecifier(realPath: string): string {
	const posix = realPath.replaceAll("\\", "/");
	return posix.startsWith("/") ? posix : `/${posix}`;
}

describe("encodeRedirectLocation / decodeEncodedSpecifier", () => {
	it("leaves pure-ASCII paths untouched (no sentinel)", ({ expect }) => {
		const p = "/a/b/c.js";
		expect(encodeRedirectLocation(p)).toBe(p);
		expect(decodeEncodedSpecifier(p)).toBe(p);
	});

	it("leaves an ASCII path containing a literal % untouched", ({ expect }) => {
		// Regression guard: the previous `safeDecodeURI()` approach would decode
		// this `%20` to a space and silently resolve the wrong path. A value we
		// never encoded has no sentinel, so it must be passed through verbatim.
		const p = "/a/build%20output/c.js";
		expect(encodeRedirectLocation(p)).toBe(p);
		expect(decodeEncodedSpecifier(p)).toBe(p);
	});

	it("round-trips a non-ASCII path via the sentinel", ({ expect }) => {
		const p = "/a/開発/c.js";
		const encoded = encodeRedirectLocation(p);
		expect(encoded.startsWith(ENCODED_PATH_PREFIX)).toBe(true);
		expect(encoded).toContain("%E9%96%8B%E7%99%BA");
		expect(encoded).not.toContain("開発");
		expect(decodeEncodedSpecifier(encoded)).toBe(p);
	});

	it("preserves / and : so Windows drive-letter paths round-trip", ({
		expect,
	}) => {
		const p = "/C:/開発/c.js";
		const encoded = encodeRedirectLocation(p);
		expect(encoded).toBe(`${ENCODED_PATH_PREFIX}/C:/%E9%96%8B%E7%99%BA/c.js`);
		expect(decodeEncodedSpecifier(encoded)).toBe(p);
	});

	it("round-trips a path mixing non-ASCII and a literal %", ({ expect }) => {
		// `encodeURI()`/`decodeURI()` can't do this: `decodeURI` throws on the bare
		// `%of`. Escaping `%` first (to `%25`) makes the transform reversible.
		const p = "/a/開発/50%off/c.js";
		const encoded = encodeRedirectLocation(p);
		expect(encoded).toContain("50%25off");
		expect(decodeEncodedSpecifier(encoded)).toBe(p);
	});

	it("round-trips astral characters (surrogate pairs)", ({ expect }) => {
		const p = "/a/😀/c.js";
		const encoded = encodeRedirectLocation(p);
		expect(encoded.startsWith(ENCODED_PATH_PREFIX)).toBe(true);
		expect(decodeEncodedSpecifier(encoded)).toBe(p);
	});

	it("leaves bare module specifiers untouched", ({ expect }) => {
		expect(decodeEncodedSpecifier("cloudflare:test-internal")).toBe(
			"cloudflare:test-internal"
		);
		expect(decodeEncodedSpecifier("node:assert")).toBe("node:assert");
	});

	it("does not throw on an un-encoded value with an invalid % escape", ({
		expect,
	}) => {
		// The exact input that made the old blind `decodeURI()` throw `URIError`.
		// Without a sentinel we never decode, so there is nothing to throw.
		const p = "/a/50%off/c.js";
		expect(() => decodeEncodedSpecifier(p)).not.toThrow();
		expect(decodeEncodedSpecifier(p)).toBe(p);
	});
});

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

describe("handleModuleFallbackRequest non-ASCII paths", () => {
	let tmp: string;

	beforeEach(() => {
		tmp = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "mf-fallback-"))
		);
	});

	afterEach(() => {
		removeDirSync(tmp);
	});

	it("percent-encodes a non-ASCII redirect Location without throwing", async ({
		expect,
	}) => {
		// Requiring a directory redirects to its resolved `index.js`; the resolved
		// path contains CJK characters, which previously threw when set as the
		// `Location` header ("Cannot convert argument to a ByteString...").
		const pkgDir = path.join(tmp, "開発", "pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(pkgDir, "index.js"),
			"module.exports = { ok: true };"
		);

		const specifier = toWorkerdSpecifier(pkgDir);
		const res = await handleModuleFallbackRequest(
			fakeVite(),
			moduleFallbackRequest({
				method: "require",
				specifier,
				referrer: toWorkerdSpecifier(path.join(tmp, "entry.js")),
			})
		);

		expect(res.status).toBe(301);
		const location = res.headers.get("Location");
		assert(location !== null, "expected a Location header");
		expect(location.startsWith(ENCODED_PATH_PREFIX)).toBe(true);
		// It must round-trip back to the real (decoded) index path + shim suffix.
		expect(decodeEncodedSpecifier(location)).toBe(
			`${specifier}/index.js?mf_vitest_no_cjs_esm_shim`
		);
	});

	it("decodes an echoed sentinel specifier back to the real non-ASCII file", async ({
		expect,
	}) => {
		const pkgDir = path.join(tmp, "開発", "pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		// A `.cjs` fixture is unambiguously CommonJS. A `.js` file would instead be
		// treated as ESM whenever an ancestor `package.json` declares
		// `"type": "module"` (true under some OS temp roots), yielding an
		// `esModule` field — but the module *type* is irrelevant to what this test
		// checks (that the sentinel specifier is decoded to the real file).
		fs.writeFileSync(
			path.join(pkgDir, "index.cjs"),
			"module.exports = { ok: 123 };"
		);

		// Simulate `workerd` echoing our previous redirect `Location` verbatim.
		const echoed = encodeRedirectLocation(
			`${toWorkerdSpecifier(pkgDir)}/index.cjs?mf_vitest_no_cjs_esm_shim`
		);
		const res = await handleModuleFallbackRequest(
			fakeVite(),
			moduleFallbackRequest({
				method: "require",
				specifier: echoed,
				referrer: toWorkerdSpecifier(path.join(tmp, "entry.js")),
			})
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			name: string;
			commonJsModule?: string;
		};
		// `name` must match the exact (still-encoded) specifier `workerd` sent,
		// minus the leading slash (the response name is posix-relative to root).
		expect(body.name).toBe(echoed.replace(/^\//, ""));
		expect(body.commonJsModule).toContain("ok: 123");
	});

	it("resolves an original path containing a literal % (never decoded)", async ({
		expect,
	}) => {
		// The previous `safeDecodeURI()` would decode `%20` → space here and 404.
		// `.cjs` keeps the module unambiguously CommonJS (see the sibling test);
		// this test is about the literal `%` never being decoded, not module type.
		const dir = path.join(tmp, "build%20output");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, "dep.cjs"),
			"module.exports = { pct: true };"
		);

		const res = await handleModuleFallbackRequest(
			fakeVite(),
			moduleFallbackRequest({
				method: "require",
				specifier: toWorkerdSpecifier(path.join(dir, "dep.cjs")),
				referrer: toWorkerdSpecifier(path.join(tmp, "entry.js")),
			})
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			name: string;
			commonJsModule?: string;
		};
		expect(body.commonJsModule).toContain("pct: true");
	});

	it("falls through to a 404 for an unresolvable specifier", async ({
		expect,
	}) => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const res = await handleModuleFallbackRequest(
				fakeVite(),
				moduleFallbackRequest({
					method: "import",
					specifier: "totally-nonexistent-package",
					referrer: toWorkerdSpecifier(path.join(tmp, "entry.js")),
				})
			);
			expect(res.status).toBe(404);
		} finally {
			errorSpy.mockRestore();
		}
	});
});

// `workerd` resolves `node:*`/`cloudflare:*`/`workerd:*` specifiers at the
// modules root rather than relative to the referrer, and strips the leading `/`
// before asking us about them. Answering with a redirect to `/${target}` names
// the module `workerd` is already resolving, and its module registry follows
// that self-redirect with no cycle check and no recursion bound — recursing
// until the stack overflows and the runtime dies with
// `*** Received signal #11: Segmentation fault`, naming no module.
// See https://github.com/cloudflare/workers-sdk/issues/14590
describe("built-ins unavailable at the Worker's compatibility settings", () => {
	const referrer = "/repro/node_modules/vitest/dist/module-evaluator.js";

	async function fallbackFor(options: {
		method: "import" | "require";
		specifier: string;
		resolvesTo: string;
	}) {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const res = await handleModuleFallbackRequest(
				fakeViteResolvingTo(options.resolvesTo),
				moduleFallbackRequest({
					method: options.method,
					specifier: options.specifier,
					referrer,
				})
			);
			// Snapshot the calls before restoring, which clears them.
			const logged = errorSpy.mock.calls.map((call) => call.join(" "));
			return { res, logged };
		} finally {
			errorSpy.mockRestore();
		}
	}

	it("404s instead of self-redirecting an imported `node:*` built-in", async ({
		expect,
	}) => {
		const { res } = await fallbackFor({
			method: "import",
			specifier: "node:child_process",
			resolvesTo: "/node:child_process",
		});
		// Previously a 301 to `/node:child_process` — the specifier `workerd` was
		// already resolving.
		expect(res.status).toBe(404);
		expect(res.headers.get("Location")).toBe(null);
	});

	it("404s instead of self-redirecting a required `node:*` built-in", async ({
		expect,
	}) => {
		// The redirect was previously emitted for `require()` too, so guarding
		// only the `import` path would leave this crashing.
		const { res } = await fallbackFor({
			method: "require",
			specifier: "node:child_process",
			resolvesTo: "/node:child_process",
		});
		expect(res.status).toBe(404);
		expect(res.headers.get("Location")).toBe(null);
	});

	it("404s instead of self-redirecting a `cloudflare:*` built-in", async ({
		expect,
	}) => {
		// `cloudflare:*` modules are compatibility-gated too, so the guard must
		// not be `node:`-only.
		const { res } = await fallbackFor({
			method: "import",
			specifier: "cloudflare:sockets",
			resolvesTo: "/cloudflare:sockets",
		});
		expect(res.status).toBe(404);
		expect(res.headers.get("Location")).toBe(null);
	});

	it("advises on compatibility flags rather than bundling", async ({
		expect,
	}) => {
		// Bundling can't provide a module that's built into `workerd` and simply
		// switched off, so the generic module-resolution advice is wrong here.
		const { logged } = await fallbackFor({
			method: "import",
			specifier: "node:child_process",
			resolvesTo: "/node:child_process",
		});
		expect(logged).toHaveLength(1);
		expect(logged[0]).toContain("node:child_process");
		expect(logged[0]).toContain("nodejs_compat");
		expect(logged[0]).not.toContain("bundling");
	});

	it("still redirects a prefixed specifier that resolves elsewhere", async ({
		expect,
	}) => {
		// Pool-internal modules such as `cloudflare:test` resolve to a real file,
		// so the redirect is genuine progress and must be preserved.
		const { res } = await fallbackFor({
			method: "import",
			specifier: "cloudflare:test-internal",
			resolvesTo: "/pool/dist/worker/lib/cloudflare/test-internal.mjs",
		});
		expect(res.status).toBe(301);
		expect(res.headers.get("Location")).toBe(
			"/pool/dist/worker/lib/cloudflare/test-internal.mjs"
		);
	});
});

describe("handleModuleFallbackRequest new module registry", () => {
	let tmp: string;

	beforeEach(() => {
		tmp = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "mf-fallback-v2-"))
		);
	});

	afterEach(() => {
		removeDirSync(tmp);
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
