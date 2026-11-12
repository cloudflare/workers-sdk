import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createServer, normalizePath } from "vite";
import { afterEach, describe, test } from "vitest";

const FIXTURES_ROOT = path.resolve(
	__dirname,
	"fixtures",
	"module-evaluation-errors"
);

// The Worker imports a module that throws while it is being evaluated, catches the error and responds with it.
// The error's stack should say where it was thrown, as it does for an error thrown in a handler.
// Reference: https://github.com/cloudflare/workers-sdk/issues/9027
const ENTRY = [
	"export default {",
	"  async fetch() {",
	"    try {",
	"      await import(IMPORTED);",
	"      return new Response('no error');",
	"    } catch (error) {",
	"      return new Response(`${error.message}\\n${error.stack}`);",
	"    }",
	"  },",
	"};",
].join("\n");

describe("errors thrown while evaluating a module in dev", () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) {
			removeDirSync(root);
		}
	});

	function createWorker(options: {
		imported: string;
		files: Record<string, string>;
	}) {
		fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
		const root = fs.realpathSync(
			fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-"))
		);
		roots.push(root);
		const files: Record<string, string> = {
			"cloudflare.config.ts": [
				"import { defineConfig } from '@cloudflare/config';",
				"export default defineConfig({",
				"  worker: {",
				"    name: 'worker',",
				"    entrypoint: './src/index.ts',",
				"    compatibilityDate: '2025-04-04',",
				"    compatibilityFlags: ['nodejs_compat'],",
				"  },",
				"});",
			].join("\n"),
			"src/index.ts": ENTRY.replace(
				"IMPORTED",
				JSON.stringify(options.imported)
			),
			...options.files,
		};
		for (const [file, contents] of Object.entries(files)) {
			fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
			fs.writeFileSync(path.join(root, file), contents);
		}

		return root;
	}

	async function fetchFromServer(root: string): Promise<string> {
		const server = await createServer({
			root,
			configFile: false,
			logLevel: "silent",
			plugins: [cloudflare({ inspectorPort: false, persistState: false })],
		});

		try {
			await server.listen(0);
			const url = server.resolvedUrls?.local[0];
			assert(url, "Expected the server URL to be defined");

			return await (await fetch(url)).text();
		} finally {
			await server.close();
		}
	}

	test("the stack of an error thrown by a source module names that module", async ({
		expect,
	}) => {
		const root = createWorker({
			imported: "./throws",
			files: {
				"src/throws.ts": [
					"export const value = 1;",
					"throw new Error('thrown while evaluating throws.ts');",
				].join("\n"),
			},
		});

		const text = await fetchFromServer(root);

		expect(text).toContain("thrown while evaluating throws.ts");
		expect(text).toContain(`${normalizePath(root)}/src/throws.ts:2:`);
	});

	test("the stack of `__filename is not defined` names the CommonJS dependency that references it", async ({
		expect,
	}) => {
		const root = createWorker({
			imported: "cjs-uses-filename",
			files: {
				"node_modules/cjs-uses-filename/package.json": JSON.stringify({
					name: "cjs-uses-filename",
					version: "1.0.0",
					main: "index.js",
				}),
				"node_modules/cjs-uses-filename/index.js": [
					"exports.filename = __filename;",
				].join("\n"),
			},
		});

		const text = await fetchFromServer(root);

		expect(text).toContain("__filename is not defined");
		expect(text).toContain(
			`${normalizePath(root)}/node_modules/cjs-uses-filename/index.js:1:`
		);
	});
});
