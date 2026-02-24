/* eslint-disable workers-sdk/no-vitest-import-expect */

import * as fs from "node:fs";
import * as path from "node:path";
import { findWranglerConfig } from "@cloudflare/workers-utils";
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
import { clearDialogs, mockConfirm, mockPrompt } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import {
	mockKeyListRequest,
	mockListKVNamespacesRequest,
} from "../helpers/mock-kv";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import { mockSubDomainRequest } from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWorkerSource } from "../helpers/write-worker-source";
import {
	mockAUSRequest,
	mockDeploymentsListRequest,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
	mockUploadAssetsToKVRequest,
	writeAssets,
} from "./helpers";
import type { AssetManifest } from "../../assets";

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

	describe("entry-points", () => {
		it("should be able to use `index` with no extension as the entry-point (esm)", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			mockUploadWorkerRequest({ expectedType: "esm" });
			mockSubDomainRequest();

			await runWrangler("deploy ./index");

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
		});

		it("should be able to use `index` with no extension as the entry-point (sw)", async () => {
			writeWranglerConfig();
			writeWorkerSource({ type: "sw" });
			mockUploadWorkerRequest({
				expectedType: "sw",
				useOldUploadApi: true,
			});
			mockSubDomainRequest();

			await runWrangler("deploy ./index");

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
		});

		it("should be able to use the `main` config as the entry-point for ESM sources", async () => {
			writeWranglerConfig({ main: "./index.js" });
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockSubDomainRequest();

			await runWrangler("deploy");

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
		});

		it("should use `main` relative to the wrangler.toml not cwd", async () => {
			writeWranglerConfig({
				main: "./foo/index.js",
			});
			writeWorkerSource({ basePath: "foo" });
			mockUploadWorkerRequest({ expectedEntry: "var foo = 100;" });
			mockSubDomainRequest();
			process.chdir("foo");
			await runWrangler("deploy");

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
		});

		it("should be able to transpile TypeScript (esm)", async () => {
			writeWranglerConfig();
			writeWorkerSource({ format: "ts" });
			mockUploadWorkerRequest({ expectedEntry: "var foo = 100;" });
			mockSubDomainRequest();
			await runWrangler("deploy index.ts");

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
		});

		it("should be able to transpile TypeScript (sw)", async () => {
			writeWranglerConfig();
			writeWorkerSource({ format: "ts", type: "sw" });
			mockUploadWorkerRequest({
				expectedEntry: "var foo = 100;",
				expectedType: "sw",
				useOldUploadApi: true,
			});
			mockSubDomainRequest();
			await runWrangler("deploy index.ts");

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
		});

		it("should add referenced text modules into the form upload", async () => {
			writeWranglerConfig();
			fs.writeFileSync(
				"./index.js",
				`
import txt from './textfile.txt';
export default{
  fetch(){
    return new Response(txt);
  }
}
`
			);
			fs.writeFileSync("./textfile.txt", "Hello, World!");
			mockUploadWorkerRequest({
				expectedModules: {
					"./0a0a9f2a6772942557ab5355d76af442f8f65e01-textfile.txt":
						"Hello, World!",
				},
			});
			mockSubDomainRequest();
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
		});

		it("should allow cloudflare module import", async () => {
			writeWranglerConfig();
			fs.writeFileSync(
				"./index.js",
				`
import { EmailMessage } from "cloudflare:email";
export default{
  fetch(){
    return new Response("all done");
  }
}
`
			);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
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
		});

		it("should be able to transpile entry-points in sub-directories (esm)", async () => {
			writeWranglerConfig();
			writeWorkerSource({ basePath: "./src" });
			mockUploadWorkerRequest({ expectedEntry: "var foo = 100;" });
			mockSubDomainRequest();

			await runWrangler("deploy ./src/index.js");

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
		});

		it("should not trigger autoconfig on `wrangler deploy <script>` when called with `--x-autoconfig`", async () => {
			vi.mock(import("../../autoconfig/details"), { spy: true });
			vi.mock(import("../../autoconfig/run"), { spy: true });

			const getDetailsForAutoConfigSpy = (
				await import("../../autoconfig/details")
			).getDetailsForAutoConfig;

			const runAutoConfigSpy = (await import("../../autoconfig/run"))
				.runAutoConfig;

			writeWranglerConfig();
			writeWorkerSource({ basePath: "./src" });
			mockUploadWorkerRequest({ expectedEntry: "var foo = 100;" });
			mockSubDomainRequest();

			await runWrangler("deploy ./src/index.js --x-autoconfig");

			expect(getDetailsForAutoConfigSpy).not.toHaveBeenCalled();
			expect(runAutoConfigSpy).not.toHaveBeenCalled();
		});

		it("should preserve exports on a module format worker", async () => {
			writeWranglerConfig();
			fs.writeFileSync(
				"index.js",
				`
export const abc = 123;
export const def = "show me the money";
export default {};`
			);

			await runWrangler("deploy index.js --dry-run --outdir out");

			expect(
				(
					await esbuild.build({
						entryPoints: [path.resolve("./out/index.js")],
						metafile: true,
						write: false,
					})
				).metafile?.outputs["index.js"].exports
			).toMatchInlineSnapshot(`
				[
				  "abc",
				  "def",
				  "default",
				]
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
				No bindings found.
				--dry-run: exiting now.",
				  "warn": "",
				}
			`);
		});

		it("should not preserve exports on a service-worker format worker", async () => {
			writeWranglerConfig();
			fs.writeFileSync(
				"index.js",
				`
export const abc = 123;
export const def = "show me the money";
addEventListener('fetch', event => {});`
			);

			await runWrangler("deploy index.js --dry-run --outdir out");

			expect(
				(
					await esbuild.build({
						entryPoints: [path.resolve("./out/index.js")],
						metafile: true,
						write: false,
					})
				).metafile?.outputs["index.js"].exports
			).toMatchInlineSnapshot(`[]`);

			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				No bindings found.
				--dry-run: exiting now.",
				  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe entrypoint index.js has exports like an ES Module, but hasn't defined a default export like a module worker normally would. Building the worker using "service-worker" format...[0m

				",
				}
			`);
		});

		it("should be able to transpile entry-points in sub-directories (sw)", async () => {
			writeWranglerConfig();
			writeWorkerSource({ basePath: "./src", type: "sw" });
			mockUploadWorkerRequest({
				expectedEntry: "var foo = 100;",
				expectedType: "sw",
				useOldUploadApi: true,
			});
			mockSubDomainRequest();

			await runWrangler("deploy ./src/index.js");

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
		});

		it('should error if a site definition doesn\'t have a "bucket" field', async () => {
			writeWranglerConfig({
				// @ts-expect-error we're intentionally setting an invalid config
				site: {},
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockSubDomainRequest();

			await expect(runWrangler("deploy ./index.js")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Processing wrangler.toml configuration:
				  - "site.bucket" is a required field.]
			`);

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				"
			`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mProcessing wrangler.toml configuration:[0m

				    - "site.bucket" is a required field.

				"
			`);
			expect(normalizeString(std.warn)).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - Because you've defined a [site] configuration, we're defaulting to "workers-site" for the
				  deprecated \`site.entry-point\`field.
				      Add the top level \`main\` field to your configuration file:
				      \`\`\`
				      main = "workers-site/index.js"
				      \`\`\`

				"
			`);
		});

		it("should warn if there is a `site.entry-point` configuration", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};

			writeWranglerConfig({
				site: {
					"entry-point": "./index.js",
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);
			await runWrangler("deploy ./index.js");

			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "",
				  "info": "Fetching list of already uploaded assets...
				Building list of assets to upload...
				 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
				 + file-2.5938485188.txt (uploading new version of file-2.txt)
				Uploading 2 new assets...
				Uploaded 100% [2 out of 2]",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - [1mDeprecation[0m: "site.entry-point":
				      Delete the \`site.entry-point\` field, then add the top level \`main\` field to your configuration
				  file:
				      \`\`\`
				      main = "index.js"
				      \`\`\`

				",
				}
			`);
		});

		it("should resolve site.entry-point relative to wrangler.toml", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			fs.mkdirSync("my-site");
			process.chdir("my-site");
			writeWranglerConfig({
				site: {
					bucket: "assets",
					"entry-point": "my-entry",
				},
			});
			fs.mkdirSync("my-entry");
			fs.writeFileSync("my-entry/index.js", "export default {}");
			writeAssets(assets);
			process.chdir("..");
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);
			await runWrangler("deploy --config ./my-site/wrangler.toml");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			 + file-2.5938485188.txt (uploading new version of file-2.txt)
			Uploading 2 new assets...
			Uploaded 100% [2 out of 2]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(normalizeString(std.warn)).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing my-site/wrangler.toml configuration:[0m

				    - [1mDeprecation[0m: "site.entry-point":
				      Delete the \`site.entry-point\` field, then add the top level \`main\` field to your configuration
				  file:
				      \`\`\`
				      main = "my-entry/index.js"
				      \`\`\`

				"
			`);
		});

		it("should error if both main and site.entry-point are specified", async () => {
			writeWranglerConfig({
				main: "some-entry",
				site: {
					bucket: "some-bucket",
					"entry-point": "./index.js",
				},
			});

			await expect(runWrangler("deploy")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Processing wrangler.toml configuration:
				  - Don't define both the \`main\` and \`site.entry-point\` fields in your configuration.
				    They serve the same purpose: to point to the entry-point of your worker.
				    Delete the deprecated \`site.entry-point\` field from your config.]
			`);
		});

		it("should error if there is no entry-point specified", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			await expect(
				runWrangler("deploy")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`
				[Error: Missing entry-point to Worker script or to assets directory

				If there is code to deploy, you can either:
				- Specify an entry-point to your Worker script via the command line (ex: \`npx wrangler deploy src/index.ts\`)
				- Or add the following to your "wrangler.toml" file:

				\`\`\`
				main = "src/index.ts"

				\`\`\`


				If are uploading a directory of assets, you can either:
				- Specify the path to the directory of assets via the command line: (ex: \`npx wrangler deploy --assets=./dist\`)
				- Or add the following to your "wrangler.toml" file:

				\`\`\`
				[assets]
				directory = "./dist"

				\`\`\`
				]
			`
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				"
			`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mMissing entry-point to Worker script or to assets directory[0m


				  If there is code to deploy, you can either:
				  - Specify an entry-point to your Worker script via the command line (ex: \`npx wrangler deploy
				  src/index.ts\`)
				  - Or add the following to your "wrangler.toml" file:

				  \`\`\`
				  main = "src/index.ts"

				  \`\`\`


				  If are uploading a directory of assets, you can either:
				  - Specify the path to the directory of assets via the command line: (ex: \`npx wrangler deploy
				  --assets=./dist\`)
				  - Or add the following to your "wrangler.toml" file:

				  \`\`\`
				  [assets]
				  directory = "./dist"

				  \`\`\`


				"
			`);
		});

		describe("should source map validation errors", () => {
			function mockDeployWithValidationError(message: string) {
				const handler = http.post(
					"*/accounts/:accountId/workers/scripts/:scriptName/versions",
					async () => {
						const body = createFetchResult(null, false, [
							{ code: 10021, message },
						]);
						return HttpResponse.json(body);
					}
				);
				msw.use(handler);
			}

			it("with TypeScript source file", async () => {
				writeWranglerConfig();
				fs.writeFileSync(
					`index.ts`,
					dedent`interface Env {
						THING: string;
					}
					x;
					export default {
						fetch() {
							return new Response("body");
						}
					}`
				);
				mockDeployWithValidationError(
					"Uncaught ReferenceError: x is not defined\n  at index.js:2:1\n"
				);
				mockSubDomainRequest();

				await expect(runWrangler("deploy ./index.ts")).rejects.toMatchObject({
					notes: [{ text: expect.stringContaining("index.ts:4:1") }, {}],
				});
			});

			it("with additional modules", async () => {
				writeWranglerConfig({
					no_bundle: true,
					rules: [{ type: "ESModule", globs: ["**/*.js"] }],
				});

				fs.writeFileSync(
					"dep.ts",
					dedent`interface Env {
					}
					y;
					export default "message";`
				);
				await esbuild.build({
					bundle: true,
					format: "esm",
					entryPoints: [path.resolve("dep.ts")],
					outdir: process.cwd(),
					sourcemap: true,
				});

				fs.writeFileSync(
					"index.js",
					dedent`import dep from "./dep.js";
					export default {
						fetch() {
							return new Response(dep);
						}
					}`
				);

				mockDeployWithValidationError(
					"Uncaught ReferenceError: y is not defined\n  at dep.js:2:1\n"
				);
				mockSubDomainRequest();

				await expect(runWrangler("deploy ./index.js")).rejects.toMatchObject({
					notes: [{ text: expect.stringContaining("dep.ts:3:1") }, {}],
				});
			});

			it("with inline source map", async () => {
				writeWranglerConfig({
					no_bundle: true,
				});

				fs.writeFileSync(
					"index.ts",
					dedent`interface Env {}
					z;
					export default {
						fetch() {
							return new Response("body");
						}
					}`
				);
				await esbuild.build({
					bundle: true,
					format: "esm",
					entryPoints: [path.resolve("index.ts")],
					outdir: process.cwd(),
					sourcemap: "inline",
				});

				mockDeployWithValidationError(
					"Uncaught ReferenceError: z is not defined\n  at index.js:2:1\n"
				);
				mockSubDomainRequest();

				await expect(runWrangler("deploy ./index.js")).rejects.toMatchObject({
					notes: [{ text: expect.stringContaining("index.ts:2:1") }, {}],
				});
			});
		});

		describe("should interactively handle misconfigured asset-only deployments", () => {
			beforeEach(() => {
				setIsTTY(true);

				// Mock the date to ensure consistent compatibility_date
				vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));

				// so that we can test that the name prompt defaults to the directory name
				fs.mkdirSync("my-site");
				process.chdir("my-site");
				const assets = [
					{ filePath: "index.html", content: "<html>test</html>" },
				];
				writeAssets(assets);
				expect(findWranglerConfig().configPath).toBe(undefined);
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedAssets: {
						jwt: "<<aus-completion-token>>",
						config: {},
					},
					expectedType: "none",
				});
			});
			afterEach(() => {
				setIsTTY(false);
				vi.useRealTimers();
			});

			// TODO: remove this test once autoconfig goes GA and its experimental opt-in flag is removed
			it("should handle `wrangler deploy <directory>`", async () => {
				mockConfirm({
					text: "It looks like you are trying to deploy a directory of static assets only. Is this correct?",
					result: true,
				});
				mockPrompt({
					text: "What do you want to name your project?",
					options: { defaultValue: "my-site" },
					result: "test-name",
				});
				mockConfirm({
					text: "Do you want Wrangler to write a wrangler.json config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
					result: true,
				});

				const bodies: AssetManifest[] = [];
				await mockAUSRequest(bodies);

				await runWrangler("deploy ./assets");
				expect(bodies.length).toBe(1);
				expect(bodies[0]).toEqual({
					manifest: {
						"/index.html": {
							hash: "8308ce789f3d08668ce87176838d59d0",
							size: 17,
						},
					},
				});
				expect(fs.readFileSync("wrangler.jsonc", "utf-8"))
					.toMatchInlineSnapshot(`
						"{
						  "name": "test-name",
						  "compatibility_date": "2024-01-01",
						  "assets": {
						    "directory": "./assets"
						  }
						}"
					`);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────



					No compatibility date found Defaulting to today: 2024-01-01

					Wrote
					{
					  "name": "test-name",
					  "compatibility_date": "2024-01-01",
					  "assets": {
					    "directory": "./assets"
					  }
					}
					 to <cwd>/wrangler.jsonc.
					Please run \`wrangler deploy\` instead of \`wrangler deploy ./assets\` next time. Wrangler will automatically use the configuration saved to wrangler.jsonc.

					Proceeding with deployment...

					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
			});

			it("should handle interactive `wrangler deploy <directory>` flows without triggering autoconfig when called with `--x-autoconfig`", async () => {
				vi.mock(import("../../autoconfig/details"), { spy: true });
				vi.mock(import("../../autoconfig/run"), { spy: true });

				const getDetailsForAutoConfigSpy = (
					await import("../../autoconfig/details")
				).getDetailsForAutoConfig;

				const runAutoConfigSpy = (await import("../../autoconfig/run"))
					.runAutoConfig;

				mockConfirm({
					text: "It looks like you are trying to deploy a directory of static assets only. Is this correct?",
					result: true,
				});
				mockPrompt({
					text: "What do you want to name your project?",
					options: { defaultValue: "my-site" },
					result: "test-name",
				});
				mockConfirm({
					text: "Do you want Wrangler to write a wrangler.json config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
					result: true,
				});

				const bodies: AssetManifest[] = [];
				await mockAUSRequest(bodies);

				await runWrangler("deploy ./assets --x-autoconfig");
				expect(bodies.length).toBe(1);
				expect(bodies[0]).toEqual({
					manifest: {
						"/index.html": {
							hash: "8308ce789f3d08668ce87176838d59d0",
							size: 17,
						},
					},
				});
				expect(fs.readFileSync("wrangler.jsonc", "utf-8"))
					.toMatchInlineSnapshot(`
						"{
						  "name": "test-name",
						  "compatibility_date": "2024-01-01",
						  "assets": {
						    "directory": "./assets"
						  }
						}"
					`);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────



					No compatibility date found Defaulting to today: 2024-01-01

					Wrote
					{
					  "name": "test-name",
					  "compatibility_date": "2024-01-01",
					  "assets": {
					    "directory": "./assets"
					  }
					}
					 to <cwd>/wrangler.jsonc.
					Please run \`wrangler deploy\` instead of \`wrangler deploy ./assets\` next time. Wrangler will automatically use the configuration saved to wrangler.jsonc.

					Proceeding with deployment...

					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(getDetailsForAutoConfigSpy).not.toHaveBeenCalled();
				expect(runAutoConfigSpy).not.toHaveBeenCalled();
			});

			// TODO: remove this test once autoconfig goes GA and its experimental opt-in flag is removed
			it("should handle `wrangler deploy --assets` without name or compat date", async () => {
				// if the user has used --assets flag and args.script is not set, we just need to prompt for the name and add compat date
				mockPrompt({
					text: "What do you want to name your project?",
					options: { defaultValue: "my-site" },
					result: "test-name",
				});
				mockConfirm({
					text: "Do you want Wrangler to write a wrangler.json config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
					result: true,
				});

				const bodies: AssetManifest[] = [];
				await mockAUSRequest(bodies);

				await runWrangler("deploy --assets ./assets");
				expect(bodies.length).toBe(1);
				expect(bodies[0]).toEqual({
					manifest: {
						"/index.html": {
							hash: "8308ce789f3d08668ce87176838d59d0",
							size: 17,
						},
					},
				});
				expect(fs.readFileSync("wrangler.jsonc", "utf-8"))
					.toMatchInlineSnapshot(`
						"{
						  "name": "test-name",
						  "compatibility_date": "2024-01-01",
						  "assets": {
						    "directory": "./assets"
						  }
						}"
					`);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────


					No compatibility date found Defaulting to today: 2024-01-01

					Wrote
					{
					  "name": "test-name",
					  "compatibility_date": "2024-01-01",
					  "assets": {
					    "directory": "./assets"
					  }
					}
					 to <cwd>/wrangler.jsonc.
					Please run \`wrangler deploy\` instead of \`wrangler deploy ./assets\` next time. Wrangler will automatically use the configuration saved to wrangler.jsonc.

					Proceeding with deployment...

					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
			});

			it("should handle `wrangler deploy --assets` without name or compat date without triggering autoconfig when called with `--x-autoconfig`", async () => {
				vi.mock(import("../../autoconfig/details"), { spy: true });
				vi.mock(import("../../autoconfig/run"), { spy: true });

				const getDetailsForAutoConfigSpy = (
					await import("../../autoconfig/details")
				).getDetailsForAutoConfig;

				const runAutoConfigSpy = (await import("../../autoconfig/run"))
					.runAutoConfig;

				// if the user has used --assets flag and args.script is not set, we just need to prompt for the name and add compat date
				mockPrompt({
					text: "What do you want to name your project?",
					options: { defaultValue: "my-site" },
					result: "test-name",
				});
				mockConfirm({
					text: "Do you want Wrangler to write a wrangler.json config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
					result: true,
				});

				const bodies: AssetManifest[] = [];
				await mockAUSRequest(bodies);

				await runWrangler("deploy --assets ./assets --x-autoconfig");
				expect(bodies.length).toBe(1);
				expect(bodies[0]).toEqual({
					manifest: {
						"/index.html": {
							hash: "8308ce789f3d08668ce87176838d59d0",
							size: 17,
						},
					},
				});
				expect(fs.readFileSync("wrangler.jsonc", "utf-8"))
					.toMatchInlineSnapshot(`
						"{
						  "name": "test-name",
						  "compatibility_date": "2024-01-01",
						  "assets": {
						    "directory": "./assets"
						  }
						}"
					`);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────


					No compatibility date found Defaulting to today: 2024-01-01

					Wrote
					{
					  "name": "test-name",
					  "compatibility_date": "2024-01-01",
					  "assets": {
					    "directory": "./assets"
					  }
					}
					 to <cwd>/wrangler.jsonc.
					Please run \`wrangler deploy\` instead of \`wrangler deploy ./assets\` next time. Wrangler will automatically use the configuration saved to wrangler.jsonc.

					Proceeding with deployment...

					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(getDetailsForAutoConfigSpy).not.toHaveBeenCalled();
				expect(runAutoConfigSpy).not.toHaveBeenCalled();
			});

			it("should not trigger autoconfig on `wrangler deploy <script>` when called with `--x-autoconfig`", async () => {
				vi.mock(import("../../autoconfig/details"), { spy: true });
				vi.mock(import("../../autoconfig/run"), { spy: true });

				const getDetailsForAutoConfigSpy = (
					await import("../../autoconfig/details")
				).getDetailsForAutoConfig;

				const runAutoConfigSpy = (await import("../../autoconfig/run"))
					.runAutoConfig;

				mockConfirm({
					text: "It looks like you are trying to deploy a directory of static assets only. Is this correct?",
					result: true,
				});
				mockPrompt({
					text: "What do you want to name your project?",
					options: { defaultValue: "my-site" },
					result: "test-name",
				});
				mockConfirm({
					text: "Do you want Wrangler to write a wrangler.json config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
					result: true,
				});

				const bodies: AssetManifest[] = [];
				await mockAUSRequest(bodies);

				await runWrangler("deploy ./assets --x-autoconfig");
				expect(bodies.length).toBe(1);
				expect(bodies[0]).toEqual({
					manifest: {
						"/index.html": {
							hash: "8308ce789f3d08668ce87176838d59d0",
							size: 17,
						},
					},
				});
				expect(fs.readFileSync("wrangler.jsonc", "utf-8"))
					.toMatchInlineSnapshot(`
						"{
						  "name": "test-name",
						  "compatibility_date": "2024-01-01",
						  "assets": {
						    "directory": "./assets"
						  }
						}"
					`);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────



					No compatibility date found Defaulting to today: 2024-01-01

					Wrote
					{
					  "name": "test-name",
					  "compatibility_date": "2024-01-01",
					  "assets": {
					    "directory": "./assets"
					  }
					}
					 to <cwd>/wrangler.jsonc.
					Please run \`wrangler deploy\` instead of \`wrangler deploy ./assets\` next time. Wrangler will automatically use the configuration saved to wrangler.jsonc.

					Proceeding with deployment...

					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(getDetailsForAutoConfigSpy).not.toHaveBeenCalled();
				expect(runAutoConfigSpy).not.toHaveBeenCalled();
			});

			it("should suggest 'my-project' if the default name from the cwd is invalid", async () => {
				process.chdir("../");
				fs.renameSync("my-site", "[blah]");
				process.chdir("[blah]");
				// if the user has used --assets flag and args.script is not set, we just need to prompt for the name and add compat date
				mockPrompt({
					text: "What do you want to name your project?",
					// not [blah] because it is an invalid worker name
					options: { defaultValue: "my-project" },
					result: "test-name",
				});
				mockConfirm({
					text: "Do you want Wrangler to write a wrangler.json config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
					result: true,
				});

				const bodies: AssetManifest[] = [];
				await mockAUSRequest(bodies);

				await runWrangler("deploy --assets ./assets");
				expect(bodies.length).toBe(1);
				expect(bodies[0]).toEqual({
					manifest: {
						"/index.html": {
							hash: "8308ce789f3d08668ce87176838d59d0",
							size: 17,
						},
					},
				});
				expect(fs.readFileSync("wrangler.jsonc", "utf-8"))
					.toMatchInlineSnapshot(`
						"{
						  "name": "test-name",
						  "compatibility_date": "2024-01-01",
						  "assets": {
						    "directory": "./assets"
						  }
						}"
					`);
			});

			it("should bail if the user denies that they are trying to deploy a directory", async () => {
				mockConfirm({
					text: "It looks like you are trying to deploy a directory of static assets only. Is this correct?",
					result: false,
				});

				await expect(runWrangler("deploy ./assets")).rejects
					.toThrowErrorMatchingInlineSnapshot(`
					[Error: The provided entry-point path, "assets", points to a directory, rather than a file.

					 If you want to deploy a directory of static assets, you can do so by using the \`--assets\` flag. For example:

					wrangler deploy --assets=./assets
					]
				`);
			});

			it("does not write out a wrangler config file if the user says no", async () => {
				mockPrompt({
					text: "What do you want to name your project?",
					options: { defaultValue: "my-site" },
					result: "test-name",
				});
				mockConfirm({
					text: "Do you want Wrangler to write a wrangler.json config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
					result: false,
				});

				const bodies: AssetManifest[] = [];
				await mockAUSRequest(bodies);

				await runWrangler("deploy --assets ./assets");
				expect(bodies.length).toBe(1);
				expect(bodies[0]).toEqual({
					manifest: {
						"/index.html": {
							hash: "8308ce789f3d08668ce87176838d59d0",
							size: 17,
						},
					},
				});
				expect(fs.existsSync("wrangler.jsonc")).toBe(false);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────


					No compatibility date found Defaulting to today: 2024-01-01

					You should run wrangler deploy --name test-name --compatibility-date 2024-01-01 --assets ./assets next time to deploy this Worker without going through this flow again.

					Proceeding with deployment...

					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
			});
		});
	});
});
