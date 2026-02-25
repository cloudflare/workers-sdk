/* eslint-disable workers-sdk/no-vitest-import-expect */

import * as fs from "node:fs";
import * as path from "node:path";
import {
	normalizeString,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import * as esbuild from "esbuild";
import { http, HttpResponse } from "msw";
import dedent from "ts-dedent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getInstalledPackageVersion } from "../../autoconfig/frameworks/utils/packages";
import { clearOutputFilePath } from "../../output";
import { fetchSecrets } from "../../utils/fetch-secrets";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import { mockSubDomainRequest } from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWorkerSource } from "../helpers/write-worker-source";
import {
	mockDeploymentsListRequest,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
} from "./helpers";

vi.mock("command-exists");
vi.mock("../../check/commands", async (importOriginal) => {
	return {
		...(await importOriginal()),
		analyseBundle() {
			return `{}`;
		},
	};
});

vi.mock("../../utils/fetch-secrets");

vi.mock("../../package-manager", async (importOriginal) => ({
	...(await importOriginal()),
	sniffUserAgent: () => "npm",
	getPackageManager() {
		return {
			type: "npm",
			npx: "npx",
		};
	},
}));

vi.mock("../../autoconfig/run");
vi.mock("../../autoconfig/frameworks/utils/packages");
vi.mock("../../autoconfig/c3-vendor/command");

describe("deploy", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		vi.stubGlobal("setTimeout", (fn: () => void) => {
			setImmediate(fn);
		});
		setIsTTY(true);
		mockLastDeploymentRequest();
		mockDeploymentsListRequest();
		mockPatchScriptSettings();
		mockGetSettings();
		msw.use(...mswListNewDeploymentsLatestFull);
		// Pretend all R2 buckets exist for the purposes of deployment testing.
		// Otherwise, wrangler deploy would try to provision them. The provisioning
		// behaviour is tested in provision.test.ts
		msw.use(
			http.get("*/accounts/:accountId/r2/buckets/:bucketName", async () => {
				return HttpResponse.json(createFetchResult({}));
			})
		);
		vi.mocked(fetchSecrets).mockResolvedValue([]);
		vi.mocked(getInstalledPackageVersion).mockReturnValue(undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearDialogs();
		clearOutputFilePath();
	});

	describe("upload rules", () => {
		it("should be able to define rules for uploading non-js modules (sw)", async () => {
			writeWranglerConfig({
				rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: true }],
			});
			fs.writeFileSync("./index.js", `import TEXT from './text.file';`);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedType: "sw",
				expectedBindings: [
					{
						name: "__2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0_text_file",
						part: "__2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0_text_file",
						type: "text_blob",
					},
				],
				expectedModules: {
					__2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0_text_file:
						"SOME TEXT CONTENT",
				},
				useOldUploadApi: true,
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should be able to define rules for uploading non-js modules (esm)", async () => {
			writeWranglerConfig({
				rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: true }],
			});
			fs.writeFileSync(
				"./index.js",
				`import TEXT from './text.file'; export default {};`
			);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedType: "esm",
				expectedBindings: [],
				expectedModules: {
					"./2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0-text.file":
						"SOME TEXT CONTENT",
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should be able to use fallthrough:true for multiple rules", async () => {
			writeWranglerConfig({
				rules: [
					{ type: "Text", globs: ["**/*.file"], fallthrough: true },
					{ type: "Text", globs: ["**/*.other"], fallthrough: true },
				],
			});
			fs.writeFileSync(
				"./index.js",
				`import TEXT from './text.file'; import OTHER from './other.other'; export default {};`
			);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			fs.writeFileSync("./other.other", "SOME OTHER TEXT CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedType: "esm",
				expectedBindings: [],
				expectedModules: {
					"./2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0-text.file":
						"SOME TEXT CONTENT",
					"./16347a01366873ed80fe45115119de3c92ab8db0-other.other":
						"SOME OTHER TEXT CONTENT",
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should be able to use fallthrough:false for multiple rules", async () => {
			writeWranglerConfig({
				rules: [
					{ type: "Text", globs: ["**/*.file"], fallthrough: false },
					{ type: "Text", globs: ["**/*.other"] },
				],
			});
			fs.writeFileSync(
				"./index.js",
				`import TEXT from './text.file'; import OTHER from './other.other'; export default {};`
			);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			fs.writeFileSync("./other.other", "SOME OTHER TEXT CONTENT");

			// We throw an error when we come across a file that matched a rule
			// but was skipped because of fallthrough = false
			let err: Error | undefined;
			try {
				await runWrangler("deploy index.js");
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatch(
				`The file ./other.other matched a module rule in your configuration ({"type":"Text","globs":["**/*.other"]}), but was ignored because a previous rule with the same type was not marked as \`fallthrough = true\`.`
			);
		});

		it("should warn when multiple rules for the same type do not have fallback defined", async () => {
			writeWranglerConfig({
				rules: [
					{ type: "Text", globs: ["**/*.file"] },
					{ type: "Text", globs: ["**/*.other"] },
				],
			});
			fs.writeFileSync(
				"./index.js",
				`import TEXT from './text.file'; import OTHER from './other.other'; export default {};`
			);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			fs.writeFileSync("./other.other", "SOME OTHER TEXT CONTENT");

			// We throw an error when we come across a file that matched a rule
			// but was skipped because of fallthrough = false
			let err: Error | undefined;
			try {
				await runWrangler("deploy index.js");
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatch(
				`The file ./other.other matched a module rule in your configuration ({"type":"Text","globs":["**/*.other"]}), but was ignored because a previous rule with the same type was not marked as \`fallthrough = true\`.`
			);
			// and the warnings because fallthrough was not explicitly set
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe module rule {"type":"Text","globs":["**/*.file"]} does not have a fallback, the following rules will be ignored:[0m

				   {"type":"Text","globs":["**/*.other"]}
				   {"type":"Text","globs":["**/*.txt","**/*.html","**/*.sql"]} (DEFAULT)

				  Add \`fallthrough = true\` to rule to allow next rule to be used or \`fallthrough = false\` to silence
				  this warning

				"
			`);
		});

		it("should be able to preserve file names when defining rules for uploading non-js modules (sw)", async () => {
			writeWranglerConfig({
				rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: true }],
				preserve_file_names: true,
			});
			fs.writeFileSync("./index.js", `import TEXT from './text.file';`);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedType: "sw",
				expectedBindings: [
					{
						name: "__text_file",
						part: "__text_file",
						type: "text_blob",
					},
				],
				expectedModules: {
					__text_file: "SOME TEXT CONTENT",
				},
				useOldUploadApi: true,
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should be able to preserve file names when defining rules for uploading non-js modules (esm)", async () => {
			writeWranglerConfig({
				rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: true }],
				preserve_file_names: true,
			});
			fs.writeFileSync(
				"./index.js",
				`import TEXT from './text.file'; export default {};`
			);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedType: "esm",
				expectedBindings: [],
				expectedModules: {
					"./text.file": "SOME TEXT CONTENT",
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		describe("inject process.env.NODE_ENV", () => {
			beforeEach(() => {
				vi.stubEnv("NODE_ENV", "some-node-env");
			});

			it("should replace `process.env.NODE_ENV` in scripts", async () => {
				writeWranglerConfig();
				fs.writeFileSync(
					"./index.js",
					`export default {
            fetch(){
              return new Response(process.env.NODE_ENV);
            }
          }`
				);
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedEntry: `return new Response("some-node-env");`,
				});
				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});
	});
	describe("service worker format", () => {
		it("should error if trying to import a cloudflare prefixed external when in service worker format", async () => {
			writeWranglerConfig();
			fs.writeFileSync(
				"dep-1.js",
				dedent`
					import sockets from 'cloudflare:sockets';
					export const external = sockets;
				`
			);
			fs.writeFileSync(
				"dep-2.js",
				dedent`
					export const internal = 100;
				`
			);
			fs.writeFileSync(
				"index.js",
				dedent`
					import {external} from "./dep-1"; // will the external import check be transitive?
					import {internal} from "./dep-2"; // ensure that we can still have a non-external import
					let x = [external, internal]; // to ensure that esbuild doesn't tree shake the imports
					// no default export making this a service worker format
					addEventListener('fetch', (event) => {
						event.respondWith(new Response(''));
					});
			`
			);

			await expect(
				runWrangler("deploy index.js --dry-run").catch((e) =>
					normalizeString(
						esbuild
							.formatMessagesSync(e?.errors ?? [], { kind: "error" })
							.join()
							.trim()
					)
				)
			).resolves.toMatchInlineSnapshot(`
				"X [ERROR] Unexpected external import of "cloudflare:sockets".
				Your worker has no default export, which means it is assumed to be a Service Worker format Worker.
				Did you mean to create a ES Module format Worker?
				If so, try adding \`export default { ... }\` in your entry-point.
				See https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/. [plugin cloudflare-internal-imports]"
			`);
		});

		it("should error if importing a node.js library when in service worker format", async () => {
			writeWranglerConfig();
			fs.writeFileSync(
				"index.js",
				dedent`
					import stream from "node:stream";
					let temp = stream;
					addEventListener('fetch', (event) => {
						event.respondWith(new Response(''));
					});
			`
			);

			await expect(
				runWrangler("deploy index.js --dry-run").catch((e) =>
					normalizeString(
						esbuild
							.formatMessagesSync(e?.errors ?? [], { kind: "error" })
							.join()
							.trim()
					)
				)
			).resolves.toMatchInlineSnapshot(`
				"X [ERROR] Unexpected external import of "node:stream".
				Your worker has no default export, which means it is assumed to be a Service Worker format Worker.
				Did you mean to create a ES Module format Worker?
				If so, try adding \`export default { ... }\` in your entry-point.
				See https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/. [plugin nodejs_compat-imports]"
			`);
		});

		it("should error if nodejs_compat (v2) is turned on when in service worker format", async () => {
			writeWranglerConfig({
				compatibility_date: "2024-09-23", // Sept 23 to turn on nodejs compat v2 mode
				compatibility_flags: ["nodejs_compat"],
			});
			fs.writeFileSync(
				"index.js",
				dedent`
					addEventListener('fetch', (event) => {
						event.respondWith(new Response(''));
					});
			`
			);

			await expect(
				runWrangler("deploy index.js --dry-run").catch((e) =>
					normalizeString(
						esbuild
							.formatMessagesSync(e?.errors ?? [], { kind: "error" })
							.join()
							.trim()
					)
				)
			).resolves.toMatchInlineSnapshot(`
				"X [ERROR] Unexpected external import of "node:events", "node:perf_hooks", "node:stream", and "node:tty".
				Your worker has no default export, which means it is assumed to be a Service Worker format Worker.
				Did you mean to create a ES Module format Worker?
				If so, try adding \`export default { ... }\` in your entry-point.
				See https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/. [plugin hybrid-nodejs_compat]"
			`);
		});
	});
	describe("legacy module specifiers", () => {
		it("should work with legacy module specifiers, with a deprecation warning (1)", async () => {
			writeWranglerConfig({
				rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: false }],
			});
			fs.writeFileSync(
				"./index.js",
				`import TEXT from 'text.file'; export default {};`
			);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedModules: {
					"./2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0-text.file":
						"SOME TEXT CONTENT",
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mDeprecation: detected a legacy module import in "./index.js". This will stop working in the future. Replace references to "text.file" with "./text.file";[0m

				"
			`);
		});

		it("should work with legacy module specifiers, with a deprecation warning (2)", async () => {
			writeWranglerConfig();
			fs.writeFileSync(
				"./index.js",
				`import WASM from 'index.wasm'; export default {};`
			);
			fs.writeFileSync("./index.wasm", "SOME WASM CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedModules: {
					"./94b240d0d692281e6467aa42043986e5c7eea034-index.wasm":
						"SOME WASM CONTENT",
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mDeprecation: detected a legacy module import in "./index.js". This will stop working in the future. Replace references to "index.wasm" with "./index.wasm";[0m

				"
			`);
		});

		it("should work with legacy module specifiers, with a deprecation warning (3)", async () => {
			writeWranglerConfig({
				rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: false }],
			});
			fs.writeFileSync(
				"./index.js",
				`import TEXT from 'text+name.file'; export default {};`
			);
			fs.writeFileSync("./text+name.file", "SOME TEXT CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedModules: {
					"./2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0-text+name.file":
						"SOME TEXT CONTENT",
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mDeprecation: detected a legacy module import in "./index.js". This will stop working in the future. Replace references to "text+name.file" with "./text+name.file";[0m

				"
			`);
		});

		it("should not match regular module specifiers when there aren't any possible legacy module matches", async () => {
			// see https://github.com/cloudflare/workers-sdk/issues/655 for bug details

			fs.writeFileSync(
				"./index.js",
				`import inner from './inner/index.js'; export default {};`
			);
			fs.mkdirSync("./inner", { recursive: true });
			fs.writeFileSync("./inner/index.js", `export default 123`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();

			await runWrangler(
				"deploy index.js --compatibility-date 2022-03-17 --name test-name"
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});
	});
	describe("tsconfig", () => {
		it("should use compilerOptions.paths to resolve modules", async () => {
			writeWranglerConfig({
				main: "index.ts",
			});
			fs.writeFileSync(
				"index.ts",
				`import { foo } from '~lib/foo'; export default { fetch() { return new Response(foo)} }`
			);
			fs.mkdirSync("lib", { recursive: true });
			fs.writeFileSync("lib/foo.ts", `export const foo = 123;`);
			fs.writeFileSync(
				"tsconfig.json",
				JSON.stringify({
					compilerOptions: {
						baseUrl: ".",
						paths: {
							"~lib/*": ["lib/*"],
						},
					},
				})
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedEntry: "var foo = 123;", // make sure it imported the module correctly
			});
			await runWrangler("deploy index.ts");
			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});

		it("should use compilerOptions.paths to resolve non-js modules with module rules", async () => {
			writeWranglerConfig({
				main: "index.ts",
				rules: [{ type: "Text", globs: ["**/*.graphql"], fallthrough: true }],
			});
			fs.writeFileSync(
				"index.ts",
				`import schema from '~lib/schema.graphql'; export default { fetch() { return new Response(schema)} }`
			);
			fs.mkdirSync("lib", { recursive: true });
			fs.writeFileSync("lib/schema.graphql", `type Query { hello: String }`);
			fs.writeFileSync(
				"tsconfig.json",
				JSON.stringify({
					compilerOptions: {
						baseUrl: ".",
						paths: {
							"~lib/*": ["lib/*"],
						},
					},
				})
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedModules: {
					"./bc4a21e10be4cae586632dfe5c3f049299c06466-schema.graphql":
						"type Query { hello: String }",
				},
			});
			await runWrangler("deploy index.ts");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should output to target es2022 even if tsconfig says otherwise", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			fs.writeFileSync(
				"./index.js",
				`
			import { foo } from "./another";
			const topLevelAwait = await new Promise((resolve) => setTimeout(resolve, 0));

			export default {
  			async fetch(request) {

    			return new Response("Hello world!");
  			},
			};`
			);
			fs.writeFileSync(
				"tsconfig.json",
				JSON.stringify({
					compilerOptions: {
						target: "es5",
						module: "commonjs",
					},
				})
			);
			mockSubDomainRequest();
			/**
			 * When we compile with es2022, we should preserve the export statement and top level await
			 * If you attempt to target es2020 top level await will cause a build error
			 * @error Build failed with 1 error:
			 * index.js:3:25: ERROR: Top-level await is not available in the configured target environment ("es2020")
			 */
			mockUploadWorkerRequest({
				expectedEntry: "export {", // check that the export is preserved
			});
			await runWrangler("deploy index.js"); // this would throw if we tried to compile with es5
			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});
	});
	describe("--outdir", () => {
		it("should generate built assets at --outdir if specified", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler("deploy index.js --outdir some-dir");
			expect(fs.existsSync("some-dir/index.js")).toBe(true);
			expect(fs.existsSync("some-dir/index.js.map")).toBe(true);
			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});

		it("should copy any module imports related assets to --outdir if specified", async () => {
			writeWranglerConfig();
			fs.writeFileSync(
				"./index.js",
				`
import txt from './textfile.txt';
import hello from './hello.wasm';
export default{
  async fetch(){
		const module = await WebAssembly.instantiate(hello);
    return new Response(txt + module.exports.hello);
  }
}
`
			);
			fs.writeFileSync("./textfile.txt", "Hello, World!");
			fs.writeFileSync("./hello.wasm", "Hello wasm World!");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedModules: {
					"./0a0a9f2a6772942557ab5355d76af442f8f65e01-textfile.txt":
						"Hello, World!",
					"./d025a03cd31e98e96fb5bd5bce87f9bca4e8ce2c-hello.wasm":
						"Hello wasm World!",
				},
			});
			await runWrangler("deploy index.js --outdir some-dir");

			expect(fs.existsSync("some-dir/index.js")).toBe(true);
			expect(fs.existsSync("some-dir/index.js.map")).toBe(true);
			expect(fs.existsSync("some-dir/README.md")).toBe(true);
			expect(
				fs.existsSync(
					"some-dir/0a0a9f2a6772942557ab5355d76af442f8f65e01-textfile.txt"
				)
			).toBe(true);
			expect(
				fs.existsSync(
					"some-dir/d025a03cd31e98e96fb5bd5bce87f9bca4e8ce2c-hello.wasm"
				)
			).toBe(true);
			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});
	});
	describe("--outfile", () => {
		it("should generate worker bundle at --outfile if specified", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler("deploy index.js --outfile some-dir/worker.bundle");
			expect(fs.existsSync("some-dir/worker.bundle")).toBe(true);
			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});

		it("should include any module imports related assets in the worker bundle", async () => {
			writeWranglerConfig();
			fs.writeFileSync(
				"./index.js",
				`
import txt from './textfile.txt';
import hello from './hello.wasm';
export default{
  async fetch(){
		const module = await WebAssembly.instantiate(hello);
    return new Response(txt + module.exports.hello);
  }
}
`
			);
			fs.writeFileSync("./textfile.txt", "Hello, World!");
			fs.writeFileSync("./hello.wasm", "Hello wasm World!");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedModules: {
					"./0a0a9f2a6772942557ab5355d76af442f8f65e01-textfile.txt":
						"Hello, World!",
					"./d025a03cd31e98e96fb5bd5bce87f9bca4e8ce2c-hello.wasm":
						"Hello wasm World!",
				},
			});
			await runWrangler("deploy index.js --outfile some-dir/worker.bundle");

			expect(fs.existsSync("some-dir/worker.bundle")).toBe(true);
			expect(
				fs
					.readFileSync("some-dir/worker.bundle", "utf8")
					.replace(
						/------formdata-undici-0.[0-9]*/g,
						"------formdata-undici-0.test"
					)
					.replace(/wrangler_(.+?)_default/g, "wrangler_default")
			).toMatchInlineSnapshot(`
				"------formdata-undici-0.test
				Content-Disposition: form-data; name="metadata"

				{"main_module":"index.js","bindings":[],"compatibility_date":"2022-01-12","compatibility_flags":[]}
				------formdata-undici-0.test
				Content-Disposition: form-data; name="index.js"; filename="index.js"
				Content-Type: application/javascript+module

				// index.js
				import txt from "./0a0a9f2a6772942557ab5355d76af442f8f65e01-textfile.txt";
				import hello from "./d025a03cd31e98e96fb5bd5bce87f9bca4e8ce2c-hello.wasm";
				var index_default = {
				  async fetch() {
				    const module = await WebAssembly.instantiate(hello);
				    return new Response(txt + module.exports.hello);
				  }
				};
				export {
				  index_default as default
				};
				//# sourceMappingURL=index.js.map

				------formdata-undici-0.test
				Content-Disposition: form-data; name="./0a0a9f2a6772942557ab5355d76af442f8f65e01-textfile.txt"; filename="./0a0a9f2a6772942557ab5355d76af442f8f65e01-textfile.txt"
				Content-Type: text/plain

				Hello, World!
				------formdata-undici-0.test
				Content-Disposition: form-data; name="./d025a03cd31e98e96fb5bd5bce87f9bca4e8ce2c-hello.wasm"; filename="./d025a03cd31e98e96fb5bd5bce87f9bca4e8ce2c-hello.wasm"
				Content-Type: application/wasm

				Hello wasm World!
				------formdata-undici-0.test--
				"
			`);

			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});

		it("should include bindings in the worker bundle", async () => {
			writeWranglerConfig({
				kv_namespaces: [{ binding: "KV", id: "kv-namespace-id" }],
			});
			fs.writeFileSync(
				"./index.js",
				`
import txt from './textfile.txt';
import hello from './hello.wasm';
export default{
  async fetch(){
		const module = await WebAssembly.instantiate(hello);
    return new Response(txt + module.exports.hello);
  }
}
`
			);
			fs.writeFileSync("./textfile.txt", "Hello, World!");
			fs.writeFileSync("./hello.wasm", "Hello wasm World!");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedModules: {
					"./0a0a9f2a6772942557ab5355d76af442f8f65e01-textfile.txt":
						"Hello, World!",
					"./d025a03cd31e98e96fb5bd5bce87f9bca4e8ce2c-hello.wasm":
						"Hello wasm World!",
				},
			});
			await runWrangler("deploy index.js --outfile some-dir/worker.bundle");

			expect(fs.existsSync("some-dir/worker.bundle")).toBe(true);
			expect(
				fs
					.readFileSync("some-dir/worker.bundle", "utf8")
					.replace(
						/------formdata-undici-0.[0-9]*/g,
						"------formdata-undici-0.test"
					)
					.replace(/wrangler_(.+?)_default/g, "wrangler_default")
			).toMatchInlineSnapshot(`
				"------formdata-undici-0.test
				Content-Disposition: form-data; name="metadata"

				{"main_module":"index.js","bindings":[{"name":"KV","type":"kv_namespace","namespace_id":"kv-namespace-id"}],"compatibility_date":"2022-01-12","compatibility_flags":[]}
				------formdata-undici-0.test
				Content-Disposition: form-data; name="index.js"; filename="index.js"
				Content-Type: application/javascript+module

				// index.js
				import txt from "./0a0a9f2a6772942557ab5355d76af442f8f65e01-textfile.txt";
				import hello from "./d025a03cd31e98e96fb5bd5bce87f9bca4e8ce2c-hello.wasm";
				var index_default = {
				  async fetch() {
				    const module = await WebAssembly.instantiate(hello);
				    return new Response(txt + module.exports.hello);
				  }
				};
				export {
				  index_default as default
				};
				//# sourceMappingURL=index.js.map

				------formdata-undici-0.test
				Content-Disposition: form-data; name="./0a0a9f2a6772942557ab5355d76af442f8f65e01-textfile.txt"; filename="./0a0a9f2a6772942557ab5355d76af442f8f65e01-textfile.txt"
				Content-Type: text/plain

				Hello, World!
				------formdata-undici-0.test
				Content-Disposition: form-data; name="./d025a03cd31e98e96fb5bd5bce87f9bca4e8ce2c-hello.wasm"; filename="./d025a03cd31e98e96fb5bd5bce87f9bca4e8ce2c-hello.wasm"
				Content-Type: application/wasm

				Hello wasm World!
				------formdata-undici-0.test--
				"
			`);

			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                       Resource
				env.KV (kv-namespace-id)      KV Namespace

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});
	});
	describe("--metafile", () => {
		it("should output a metafile when --metafile is set", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			await runWrangler("deploy index.js --metafile --dry-run --outdir=dist");

			// Check if file exists
			const metafilePath = path.join(process.cwd(), "dist", "bundle-meta.json");
			expect(fs.existsSync(metafilePath)).toBe(true);
			const metafile = JSON.parse(fs.readFileSync(metafilePath, "utf8"));
			expect(metafile.inputs).toBeDefined();
			expect(metafile.outputs).toBeDefined();
		});

		it("should output a metafile when --metafile=./meta.json is set", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			await runWrangler("deploy index.js --metafile=./meta.json --dry-run");

			// Check if file exists
			const metafilePath = path.join(process.cwd(), "meta.json");
			expect(fs.existsSync(metafilePath)).toBe(true);
			const metafile = JSON.parse(fs.readFileSync(metafilePath, "utf8"));
			expect(metafile.inputs).toBeDefined();
			expect(metafile.outputs).toBeDefined();
		});
	});
});
