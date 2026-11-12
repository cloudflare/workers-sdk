import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { createBuilder, preview } from "vite";
import { test } from "vitest";
import { cloudflare } from "../index";

runInTempDir();

/**
 * With `nodejs_compat` and a compatibility date before the fetch iterable body
 * fixes (2026-02-19), `@cloudflare/unenv-preset` replaces the global `process`
 * with its polyfill, so that frameworks such as Astro do not detect workerd as
 * Node.js and pass an `AsyncIterable` to `new Response()`.
 * @see https://github.com/cloudflare/workers-sdk/issues/10855
 *
 * The polyfill has to be in place before any user code runs, including code
 * that Vite splits into a chunk shared with another entry, as Astro does with
 * its middleware entry.
 * @see https://github.com/cloudflare/workers-sdk/issues/14978
 */
function createFixture() {
	fs.writeFileSync(
		"cloudflare.config.ts",
		`export default { worker: {
			name: "nodejs-compat-global-polyfills",
			entrypoint: "./worker.ts",
			compatibilityDate: "2025-09-23",
			compatibilityFlags: ["nodejs_compat"],
		} };`
	);
	// Astro's `isNode` check, evaluated when the module is first loaded
	fs.writeFileSync(
		"shared.ts",
		`export const processAtLoad = globalThis.process;
		export const isNode =
			typeof process !== "undefined" &&
			Object.prototype.toString.call(process) === "[object process]";
		export function render() {
			const chunks = [new TextEncoder().encode("<h1>Hello</h1>")];
			// Astro renders to an \`AsyncIterable\` when it detects Node.js
			if (isNode) {
				return { async *[Symbol.asyncIterator]() { yield* chunks; } };
			}
			return new ReadableStream({
				start(controller) {
					chunks.forEach((chunk) => controller.enqueue(chunk));
					controller.close();
				},
			});
		}`
	);
	// A second entry that shares `shared.ts` with the Worker entry, like Astro's middleware entry
	fs.writeFileSync(
		"middleware.ts",
		`import { render } from "./shared"; export const onRequest = render;`
	);
	fs.writeFileSync(
		"worker.ts",
		`import { isNode, processAtLoad, render } from "./shared";
		export default {
			async fetch(request) {
				if (new URL(request.url).pathname === "/process") {
					return Response.json({
						isNode,
						polyfilledAtLoad: processAtLoad === globalThis.process,
					});
				}
				return new Response(render(), { headers: { "content-type": "text/html" } });
			},
		};`
	);
}

async function buildAndPreview() {
	const builder = await createBuilder(
		{
			root: process.cwd(),
			configFile: false,
			logLevel: "silent",
			plugins: [
				cloudflare({
					inspectorPort: false,
					persistState: false,
					types: { generate: false },
				}),
				{
					name: "emit-second-entry",
					buildStart() {
						if (this.environment.name === "ssr") {
							this.emitFile({
								type: "chunk",
								id: path.resolve("middleware.ts"),
								fileName: "middleware.js",
							});
						}
					},
				},
			],
		},
		null
	);
	await builder.buildApp();

	return preview({
		root: process.cwd(),
		configFile: false,
		logLevel: "silent",
		preview: { port: 0 },
		plugins: [
			cloudflare({
				inspectorPort: false,
				persistState: false,
				types: { generate: false },
			}),
		],
	});
}

test("applies the `process` polyfill before code in a chunk shared with another entry runs", async ({
	expect,
}) => {
	createFixture();
	const previewServer = await buildAndPreview();
	try {
		const url = previewServer.resolvedUrls?.local[0];
		assert(url);

		// The page renders as HTML rather than `[object Object]`
		const pageResponse = await fetch(url);
		expect.soft(await pageResponse.text()).toBe("<h1>Hello</h1>");

		// The shared chunk saw the polyfilled `process` when it was loaded
		const processResponse = await fetch(new URL("/process", url));
		expect.soft(await processResponse.json()).toEqual({
			isNode: false,
			polyfilledAtLoad: true,
		});
	} finally {
		await previewServer.close();
	}
});
