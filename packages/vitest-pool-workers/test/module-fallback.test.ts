import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { Request } from "miniflare";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	decodeEncodedSpecifier,
	ENCODED_PATH_PREFIX,
	encodeRedirectLocation,
	handleModuleFallbackRequest,
} from "../src/pool/module-fallback";
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
