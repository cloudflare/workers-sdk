import path from "node:path";
import ts from "typescript";
import { describe, it } from "vitest";

// These tests type-check code that uses `getPlatformProxy()` from Node.js the
// way a user would: with an `Env` typed by `@cloudflare/workers-types`, passing
// the `ReadableStream`s Node.js gives them (e.g. from `fetch()`) to bindings.
// At runtime the proxy accepts Node.js streams, so this code should type-check
// without any `@ts-expect-error` or casts.
// https://github.com/cloudflare/workers-sdk/issues/9972

const testsDir = __dirname;
const tsconfigPath = path.join(testsDir, "tsconfig.json");

function typeCheck(source: string): string[] {
	const parsed = ts.getParsedCommandLineOfConfigFile(
		tsconfigPath,
		{ noEmit: true, incremental: false },
		{
			...ts.sys,
			onUnRecoverableConfigFileDiagnostic(diagnostic) {
				throw new Error(
					ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
				);
			},
		}
	);
	if (parsed === undefined) {
		throw new Error(`Could not parse ${tsconfigPath}`);
	}

	// The file under test only exists in memory, but lives in this directory so
	// that `wrangler` and `@cloudflare/workers-types` resolve as they do for the
	// other tests here
	const fileName = path.join(testsDir, "__virtual-types-check__.ts");
	const host = ts.createCompilerHost(parsed.options);
	const originalGetSourceFile = host.getSourceFile.bind(host);
	const originalFileExists = host.fileExists.bind(host);
	const originalReadFile = host.readFile.bind(host);
	host.getSourceFile = (name, languageVersion, ...rest) =>
		path.resolve(name) === fileName
			? ts.createSourceFile(name, source, languageVersion, true)
			: originalGetSourceFile(name, languageVersion, ...rest);
	host.fileExists = (name) =>
		path.resolve(name) === fileName || originalFileExists(name);
	host.readFile = (name) =>
		path.resolve(name) === fileName ? source : originalReadFile(name);

	const program = ts.createProgram({
		rootNames: [fileName],
		options: parsed.options,
		host,
	});
	return ts
		.getPreEmitDiagnostics(program)
		.map((diagnostic) =>
			ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
		);
}

describe("getPlatformProxy - types", () => {
	it("type-checks the test harness itself", ({ expect }) => {
		// Sanity check that the harness resolves `wrangler` and the workers types
		// and reports genuine errors, so the tests below aren't vacuous
		expect(
			typeCheck(`
				import { getPlatformProxy } from "wrangler";
				import type { KVNamespace } from "@cloudflare/workers-types";
				export async function run() {
					const { env } = await getPlatformProxy<{ MY_KV: KVNamespace }>();
					const value: string | null = await env.MY_KV.get("key");
					return value;
				}
			`)
		).toEqual([]);
		expect(
			typeCheck(`
				import { getPlatformProxy } from "wrangler";
				import type { KVNamespace } from "@cloudflare/workers-types";
				export async function run() {
					const { env } = await getPlatformProxy<{ MY_KV: KVNamespace }>();
					const value: number = await env.MY_KV.get("key");
					return value;
				}
			`)
		).not.toEqual([]);
	});

	it("accepts a Node.js ReadableStream for Images binding info()", ({
		expect,
	}) => {
		expect(
			typeCheck(`
				import { getPlatformProxy } from "wrangler";
				import type { ImagesBinding } from "@cloudflare/workers-types";
				export async function run() {
					const { env } = await getPlatformProxy<{ IMAGES: ImagesBinding }>();
					const stream = (await fetch("https://example.com/image.png")).body!;
					return await env.IMAGES.info(stream);
				}
			`)
		).toEqual([]);
	});

	it("accepts a Node.js ReadableStream for Images binding input()", ({
		expect,
	}) => {
		expect(
			typeCheck(`
				import { getPlatformProxy } from "wrangler";
				import type { ImagesBinding } from "@cloudflare/workers-types";
				export async function run() {
					const { env } = await getPlatformProxy<{ IMAGES: ImagesBinding }>();
					const stream = (await fetch("https://example.com/image.png")).body!;
					const result = await env.IMAGES.input(stream)
						.transform({ rotate: 90 })
						.output({ format: "image/png" });
					return result.response();
				}
			`)
		).toEqual([]);
	});
});
