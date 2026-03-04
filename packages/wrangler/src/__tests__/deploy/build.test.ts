/* eslint-disable workers-sdk/no-vitest-import-expect */

import { Buffer } from "node:buffer";
import { randomFillSync } from "node:crypto";
import * as fs from "node:fs";
import { ParseError } from "@cloudflare/workers-utils";
import {
	normalizeString,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import * as esbuild from "esbuild";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";
import { getInstalledPackageVersion } from "../../autoconfig/frameworks/utils/packages";
import { printBundleSize } from "../../deployment-bundle/bundle-reporter";
import { clearOutputFilePath } from "../../output";
import { fetchSecrets } from "../../utils/fetch-secrets";
import { diagnoseScriptSizeError } from "../../utils/friendly-validator-errors";
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

	describe("[define]", () => {
		it("should be able to define values that will be substituted into top-level identifiers", async () => {
			writeWranglerConfig({
				main: "index.js",
				define: {
					abc: "123",
				},
			});
			fs.writeFileSync(
				"index.js",
				`
        // this should get replaced
        console.log(abc);
        // this should not get replaced
        console.log(globalThis.abc);

        function foo(){
          const abc = "a string";
          // this should not get replaced
          console.log(abc);
        }

        console.log(foo);
      `
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler("build");

			const outFile = normalizeString(
				fs.readFileSync("dist/index.js", "utf-8")
			);

			// We don't check against the whole file as there is middleware being injected
			expect(outFile).toContain("console.log(123);");
			expect(outFile).toContain("console.log(globalThis.abc);");
			expect(outFile).toContain(`const abc2 = "a string";`);
			expect(outFile).toContain("console.log(abc2);");
			expect(outFile).toContain("console.log(foo);");
		});

		it("can be overriden in environments", async () => {
			writeWranglerConfig({
				main: "index.js",
				define: {
					abc: "123",
				},
				env: {
					staging: {
						define: {
							abc: "456",
						},
					},
				},
			});
			fs.writeFileSync(
				"index.js",
				`
        console.log(abc);
      `
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler("build --env staging");

			const outFile = normalizeString(
				fs.readFileSync("dist/index.js", "utf-8")
			);

			// We don't check against the whole file as there is middleware being injected
			expect(outFile).toContain("console.log(456);");
		});

		it("can be overridden with cli args", async () => {
			writeWranglerConfig({
				main: "index.js",
				define: {
					abc: "123",
				},
			});
			fs.writeFileSync(
				"index.js",
				`
				console.log(abc);
			`
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler("deploy --dry-run --outdir dist --define abc:789");

			expect(fs.readFileSync("dist/index.js", "utf-8")).toContain(
				`console.log(789);`
			);
		});

		it("can be overridden with cli args containing colons", async () => {
			writeWranglerConfig({
				main: "index.js",
				define: {
					abc: "123",
				},
			});
			fs.writeFileSync(
				"index.js",
				`
				console.log(abc);
			`
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler(
				`deploy --dry-run --outdir dist --define "abc:'https://www.abc.net.au/news/'"`
			);

			expect(fs.readFileSync("dist/index.js", "utf-8")).toContain(
				// eslint-disable-next-line no-useless-escape
				`console.log(\"https://www.abc.net.au/news/\");`
			);
		});
	});
	describe("custom builds", () => {
		beforeEach(() => {
			vi.unstubAllGlobals();
		});
		it("should run a custom build before publishing", async () => {
			writeWranglerConfig({
				build: {
					command: `node -e "4+4; require('fs').writeFileSync('index.js', 'export default { fetch(){ return new Response(123) } }')"`,
				},
			});

			mockUploadWorkerRequest({
				expectedEntry: "return new Response(123)",
			});
			mockSubDomainRequest();

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				[custom build] Running: node -e "4+4; require('fs').writeFileSync('index.js', 'export default { fetch(){ return new Response(123) } }')"
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

		if (process.platform !== "win32") {
			it("should run a custom build of multiple steps combined by && before publishing", async () => {
				writeWranglerConfig({
					build: {
						command: `echo "export default { fetch(){ return new Response(123) } }" > index.js`,
					},
				});

				mockUploadWorkerRequest({
					expectedEntry: "return new Response(123)",
				});
				mockSubDomainRequest();

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					[custom build] Running: echo "export default { fetch(){ return new Response(123) } }" > index.js
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
		}

		it("should throw an error if the entry doesn't exist after the build finishes", async () => {
			writeWranglerConfig({
				main: "index.js",
				build: {
					command: `node -e "4+4;"`,
				},
			});

			await expect(runWrangler("deploy index.js")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: The expected output file at "index.js" was not found after running custom build: node -e "4+4;".
				The \`main\` property in your wrangler.toml file should point to the file generated by the custom build.]
			`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				[custom build] Running: node -e "4+4;"
				"
			`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThe expected output file at "index.js" was not found after running custom build: node -e "4+4;".[0m

				  The \`main\` property in your wrangler.toml file should point to the file generated by the custom
				  build.

				"
			`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should throw an error if the entry is a directory after the build finishes", async () => {
			writeWranglerConfig({
				main: "./",
				build: {
					command: `node -e "4+4;"`,
				},
			});

			fs.writeFileSync("./worker.js", "some content", "utf-8");
			fs.mkdirSync("./dist");
			fs.writeFileSync("./dist/index.ts", "some content", "utf-8");

			await expect(runWrangler("deploy")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: The provided entry-point path, ".", points to a directory, rather than a file.

				Did you mean to set the main field to one of:
				\`\`\`
				main = "./worker.js"
				main = "./dist/index.ts"
				\`\`\`]
			`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				[custom build] Running: node -e "4+4;"
				"
			`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThe provided entry-point path, ".", points to a directory, rather than a file.[0m


				  Did you mean to set the main field to one of:
				  \`\`\`
				  main = "./worker.js"
				  main = "./dist/index.ts"
				  \`\`\`

				"
			`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should minify the script when `--minify` is true (sw)", async () => {
			writeWranglerConfig({
				main: "./index.js",
			});
			fs.writeFileSync(
				"./index.js",
				`export
        default {
          fetch() {
            return new Response(     "hello Cpt Picard"     )
                  }
            }
        `
			);

			mockUploadWorkerRequest({
				expectedEntry: 'fetch(){return new Response("hello Cpt Picard")',
			});

			mockSubDomainRequest();
			await runWrangler("deploy index.js --minify");
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

		it("should minify the script when `minify` in config is true (esm)", async () => {
			writeWranglerConfig({
				main: "./index.js",
				legacy_env: false,
				env: {
					testEnv: {
						minify: true,
					},
				},
			});
			fs.writeFileSync(
				"./index.js",
				`export
        default {
          fetch() {
            return new Response(     "hello Cpt Picard"     )
                  }
            }
        `
			);

			mockUploadWorkerRequest({
				env: "testEnv",
				expectedType: "esm",
				useServiceEnvironments: true,
				expectedEntry: `fetch(){return new Response("hello Cpt Picard")`,
			});

			mockSubDomainRequest();
			await runWrangler("deploy -e testEnv index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (testEnv) (TIMINGS)
				Deployed test-name (testEnv) triggers (TIMINGS)
				  https://testEnv.test-name.test-sub-domain.workers.dev
				Current Version ID: undefined"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should apply esbuild's keep-names functionality by default", async () => {
			writeWranglerConfig({
				main: "./index.js",
				legacy_env: false,
				env: {
					testEnv: {},
				},
			});
			fs.writeFileSync(
				"./index.js",
				`
				export
					default {
						fetch() {
							function sayHello() {
								return "Hello World with keep_names";
							}
							return new Response(sayHello());
					}
				}
				`
			);

			const underscoreUnderscoreNameRegex = /__name\(.*?\)/;

			mockUploadWorkerRequest({
				env: "testEnv",
				expectedType: "esm",
				useServiceEnvironments: true,
				expectedEntry: (str) => {
					expect(str).toMatch(underscoreUnderscoreNameRegex);
				},
			});

			mockSubDomainRequest();
			await runWrangler("deploy -e testEnv index.js");
		});

		it("should apply esbuild's keep-names functionality unless keep_names is set to false", async () => {
			writeWranglerConfig({
				main: "./index.js",
				legacy_env: false,
				env: {
					testEnv: {
						keep_names: false,
					},
				},
			});
			fs.writeFileSync(
				"./index.js",
				`
				export
					default {
						fetch() {
							function sayHello() {
								return "Hello World without keep_names";
							}
							return new Response(sayHello());
					}
				}
				`
			);

			const underscoreUnderscoreNameRegex = /__name\(.*?\)/;

			mockUploadWorkerRequest({
				env: "testEnv",
				expectedType: "esm",
				useServiceEnvironments: true,
				expectedEntry: (str) => {
					expect(str).not.toMatch(underscoreUnderscoreNameRegex);
				},
			});

			mockSubDomainRequest();
			await runWrangler("deploy -e testEnv index.js");
		});
	});
	describe("--node-compat", () => {
		it("should error when using node compatibility mode", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			await expect(
				runWrangler("deploy index.js --node-compat --dry-run")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The --node-compat flag is no longer supported as of Wrangler v4. Instead, use the \`nodejs_compat\` compatibility flag. This includes the functionality from legacy \`node_compat\` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.]`
			);
		});

		it("should recommend node compatibility flag when using node builtins and no node compat is enabled", async () => {
			writeWranglerConfig();
			fs.writeFileSync("index.js", "import path from 'path';");

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
				"X [ERROR] Could not resolve "path"

				    index.js:1:17:
				      1 │ import path from 'path';
				        ╵                  ~~~~~~

				  The package "path" wasn't found on the file system but is built into node.
				  - Add the "nodejs_compat" compatibility flag to your project."
			`);
		});

		it("should recommend node compatibility flag when using node builtins and node compat is set only to nodejs_als", async () => {
			writeWranglerConfig({
				compatibility_flags: ["nodejs_als"],
			});
			fs.writeFileSync("index.js", "import path from 'path';");

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
				"X [ERROR] Could not resolve "path"

				    index.js:1:17:
				      1 │ import path from 'path';
				        ╵                  ~~~~~~

				  The package "path" wasn't found on the file system but is built into node.
				  - Add the "nodejs_compat" compatibility flag to your project."
			`);
		});

		it("should recommend updating the compatibility date when using node builtins and the `nodejs_compat` flag", async () => {
			writeWranglerConfig({
				compatibility_date: "2024-09-01", // older than Sept 23rd, 2024
				compatibility_flags: ["nodejs_compat"],
			});
			fs.writeFileSync("index.js", "import fs from 'path';");

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
				"X [ERROR] Could not resolve "path"

				    index.js:1:15:
				      1 │ import fs from 'path';
				        ╵                ~~~~~~

				  The package "path" wasn't found on the file system but is built into node.
				  - Make sure to prefix the module name with "node:" or update your compatibility_date to 2024-09-23 or later."
			`);
		});

		it("should recommend updating the compatibility date flag when using no_nodejs_compat and non-prefixed node builtins", async () => {
			writeWranglerConfig({
				compatibility_date: "2024-09-23",
				compatibility_flags: ["nodejs_compat", "no_nodejs_compat_v2"],
			});
			fs.writeFileSync("index.js", "import fs from 'path';");

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
				"X [ERROR] Could not resolve "path"

				    index.js:1:15:
				      1 │ import fs from 'path';
				        ╵                ~~~~~~

				  The package "path" wasn't found on the file system but is built into node.
				  - Make sure to prefix the module name with "node:" or update your compatibility_date to 2024-09-23 or later."
			`);
		});
	});
	describe("`nodejs_compat` compatibility flag", () => {
		it('when absent, should warn on any "external" `node:*` imports', async () => {
			writeWranglerConfig();
			fs.writeFileSync(
				"index.js",
				`
      import AsyncHooks from 'node:async_hooks';
      console.log(AsyncHooks);
      export default {}
      `
			);
			await runWrangler("deploy index.js --dry-run");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe package "node:async_hooks" wasn't found on the file system but is built into node.[0m

				  Your Worker may throw errors at runtime unless you enable the "nodejs_compat" compatibility flag.
				  Refer to [4mhttps://developers.cloudflare.com/workers/runtime-apis/nodejs/[0m for more details. Imported
				  from:
				   - index.js

				"
			`);
		});

		it('when present, should support "external" `node:*` imports', async () => {
			writeWranglerConfig();
			fs.writeFileSync(
				"index.js",
				`
      import path from 'node:path';
      console.log(path);
      export default {}
      `
			);

			await runWrangler(
				"deploy index.js --dry-run --outdir=dist --compatibility-flag=nodejs_compat"
			);

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
			expect(fs.readFileSync("dist/index.js", { encoding: "utf-8" })).toContain(
				`import path from "node:path";`
			);
		});

		it(`when present, and compat date is on or after 2024-09-23, should support "external" non-prefixed node imports`, async () => {
			writeWranglerConfig({
				compatibility_date: "2024-09-23",
			});
			fs.writeFileSync(
				"index.js",
				`
      import path from 'node:path';
      console.log(path);
      export default {}
      `
			);

			await runWrangler(
				"deploy index.js --dry-run --outdir=dist --compatibility-flag=nodejs_compat"
			);

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
			expect(fs.readFileSync("dist/index.js", { encoding: "utf-8" })).toContain(
				`import path from "node:path";`
			);
		});
	});
	describe("bundle reporter", () => {
		it("should print the bundle size", async () => {
			fs.writeFileSync(
				"./text.txt",
				`${new Array(100)
					.fill("Try not. Do or do not. There is no try.")
					.join("")}`
			);

			fs.writeFileSync(
				"./hello.html",
				`<!DOCTYPE html>
      <html>
        <body>
            <h2>Hello World!</h2>
        </body>
      </html>
      `
			);

			fs.writeFileSync(
				"index.js",
				`import hello from "./hello.html";
         import text from "./text.txt";
        export default {
          async fetch(request) {
            return new Response(json.stringify({ hello, text }));
        },
      };`
			);
			writeWranglerConfig({
				main: "index.js",
			});
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler("deploy");

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

		it("should print the bundle size, with API errors", async () => {
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			// Override PUT call to error out from previous helper functions
			msw.use(
				http.post(
					"*/accounts/:accountId/workers/scripts/:scriptName/versions",
					() => {
						return HttpResponse.json(
							createFetchResult(null, false, [
								{
									code: 11337,
									message:
										"Worker Startup Timed out. This could be due to script exceeding size limits or expensive code in the global scope.",
								},
							])
						);
					}
				)
			);

			fs.writeFileSync(
				"./hello.html",
				`<!DOCTYPE html>
      <html>
        <body>
            <h2>Hello World!</h2>
        </body>
      </html>
      `
			);

			fs.writeFileSync(
				"index.js",
				`import hello from "./hello.html";
        export default {
          async fetch(request) {
            return new Response(json.stringify({ hello }));
        },
      };`
			);

			writeWranglerConfig({
				main: "index.js",
			});

			await expect(runWrangler("deploy")).rejects.toMatchInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions) failed.]`
			);
			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions) failed.[0m

				  Worker Startup Timed out. This could be due to script exceeding size limits or expensive code in
				  the global scope. [code: 11337]

				  If you think this is a bug, please open an issue at:
				  [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m

				",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				",
				  "warn": "",
				}
			`);
		});

		test("should check biggest dependencies when upload fails with script size error", async () => {
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			// Override POST call to error out from previous helper functions
			msw.use(
				http.post(
					"*/accounts/:accountId/workers/scripts/:scriptName/versions",
					() => {
						return HttpResponse.json(
							createFetchResult({}, false, [
								{
									code: 10027,
									message: "workers.api.error.script_too_large",
								},
							])
						);
					}
				)
			);

			fs.writeFileSync(
				"add.wasm",
				"AGFzbQEAAAABBwFgAn9/AX8DAgEABwcBA2FkZAAACgkBBwAgACABagsACgRuYW1lAgMBAAA=",
				"base64"
			);
			fs.writeFileSync("message.txt", "👋");
			fs.writeFileSync("dependency.js", `export const thing = "a string dep";`);

			fs.writeFileSync(
				"index.js",
				`
				import addModule from "./add.wasm";
				import message from "./message.txt";
				import { thing } from "./dependency";

        export default {
          async fetch() {
          	const instance = new WebAssembly.Instance(addModule);
          	return Response.json({ add: instance.exports.add(1, 2), message, thing });
          }
        }`
			);

			writeWranglerConfig({
				main: "index.js",
			});

			await expect(runWrangler("deploy")).rejects.toMatchInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions) failed.]`
			);

			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYour Worker failed validation because it exceeded size limits.[0m


				  A request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions)
				  failed.
				   - workers.api.error.script_too_large [code: 10027]
				  Here are the 4 largest dependencies included in your script:

				  - index.js - xx KiB
				  - add.wasm - xx KiB
				  - dependency.js - xx KiB
				  - message.txt - xx KiB

				  If these are unnecessary, consider removing them



				[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions) failed.[0m

				  workers.api.error.script_too_large [code: 10027]

				  If you think this is a bug, please open an issue at:
				  [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m

				",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				",
				  "warn": "",
				}
			`);
		});

		test("should offer some helpful advice when upload fails with script startup error", async () => {
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			// Override POST call to error out from previous helper functions
			msw.use(
				http.post(
					"*/accounts/:accountId/workers/scripts/:scriptName/versions",
					() => {
						return HttpResponse.json(
							createFetchResult({}, false, [
								{
									code: 10021,
									message: "Error: Script startup exceeded CPU time limit.",
								},
							])
						);
					}
				)
			);
			fs.writeFileSync("dependency.js", `export const thing = "a string dep";`);

			fs.writeFileSync(
				"index.js",
				`import { thing } from "./dependency";

        export default {
          async fetch() {
            return new Response('response plus ' + thing);
          }
        }`
			);

			writeWranglerConfig({
				main: "index.js",
			});

			await expect(runWrangler("deploy")).rejects.toThrowError();
			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYour Worker failed validation because it exceeded startup limits.[0m


				  A request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions)
				  failed.
				   - Error: Script startup exceeded CPU time limit. [code: 10021]

				  To ensure fast responses, there are constraints on Worker startup, such as how much CPU it can
				  use, or how long it can take. Your Worker has hit one of these startup limits. Try reducing the
				  amount of work done during startup (outside the event handler), either by removing code or
				  relocating it inside the event handler.

				  Refer to [4mhttps://developers.cloudflare.com/workers/platform/limits/#worker-startup-time[0m for more
				  details
				  A CPU Profile of your Worker's startup phase has been written to
				  .wrangler/tmp/startup-profile-<HASH>/worker.cpuprofile - load it into the Chrome DevTools profiler
				  (or directly in VSCode) to view a flamegraph.


				[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions) failed.[0m

				  Error: Script startup exceeded CPU time limit. [code: 10021]

				  If you think this is a bug, please open an issue at:
				  [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m

				",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				",
				  "warn": "",
				}
			`);
		});

		describe("unit tests", () => {
			// keeping these as unit tests to try and keep them snappy, as they often deal with
			// big files that would take a while to deal with in a full wrangler test

			test("should print the bundle size", async () => {
				const bigModule = Buffer.alloc(10_000_000);
				randomFillSync(bigModule);
				await printBundleSize({ name: "index.js", content: "" }, [
					{
						name: "index.js",
						filePath: undefined,
						content: bigModule,
						type: "buffer",
					},
				]);

				expect(std).toMatchInlineSnapshot(`
					{
					  "debug": "",
					  "err": "",
					  "info": "",
					  "out": "Total Upload: xx KiB / gzip: xx KiB",
					  "warn": "",
					}
				`);
			});

			test("should print the top biggest dependencies in the bundle when upload fails", () => {
				const deps = {
					"node_modules/a-mod/module.js": { bytesInOutput: 450 },
					"node_modules/b-mod/module.js": { bytesInOutput: 10 },
					"node_modules/c-mod/module.js": { bytesInOutput: 200 },
					"node_modules/d-mod/module.js": { bytesInOutput: 2111200 }, // 1
					"node_modules/e-mod/module.js": { bytesInOutput: 8209 }, // 3
					"node_modules/f-mod/module.js": { bytesInOutput: 770 },
					"node_modules/g-mod/module.js": { bytesInOutput: 78902 }, // 2
					"node_modules/h-mod/module.js": { bytesInOutput: 899 },
					"node_modules/i-mod/module.js": { bytesInOutput: 2001 }, // 4
					"node_modules/j-mod/module.js": { bytesInOutput: 900 }, // 5
					"node_modules/k-mod/module.js": { bytesInOutput: 79 },
				};

				const message = diagnoseScriptSizeError(
					new ParseError({ text: "too big" }),
					deps
				);
				expect(message).toMatchInlineSnapshot(`
					"Your Worker failed validation because it exceeded size limits.

					too big

					Here are the 5 largest dependencies included in your script:

					- node_modules/d-mod/module.js - 2061.72 KiB
					- node_modules/g-mod/module.js - 77.05 KiB
					- node_modules/e-mod/module.js - 8.02 KiB
					- node_modules/i-mod/module.js - 1.95 KiB
					- node_modules/j-mod/module.js - 0.88 KiB

					If these are unnecessary, consider removing them
					"
				`);
			});
		});
	});
	describe("--no-bundle", () => {
		it("(cli) should not transform the source code before publishing it", async () => {
			writeWranglerConfig();
			const scriptContent = `
      import X from '@cloudflare/no-such-package'; // let's add an import that doesn't exist
      const xyz = 123; // a statement that would otherwise be compiled out
    `;
			fs.writeFileSync("index.js", scriptContent);
			await runWrangler("deploy index.js --no-bundle --dry-run --outdir dist");
			expect(fs.readFileSync("dist/index.js", "utf-8")).toMatch(scriptContent);
		});

		it("(config) should not transform the source code before publishing it", async () => {
			writeWranglerConfig({
				no_bundle: true,
			});
			const scriptContent = `
			import X from '@cloudflare/no-such-package'; // let's add an import that doesn't exist
			const xyz = 123; // a statement that would otherwise be compiled out
		`;
			fs.writeFileSync("index.js", scriptContent);
			await runWrangler("deploy index.js --dry-run --outdir dist");
			expect(fs.readFileSync("dist/index.js", "utf-8")).toMatch(scriptContent);
		});
	});
	describe("--no-bundle --minify", () => {
		it("should warn that no-bundle and minify can't be used together", async () => {
			writeWranglerConfig();
			const scriptContent = `
			const xyz = 123; // a statement that would otherwise be compiled out
		`;
			fs.writeFileSync("index.js", scriptContent);
			await runWrangler(
				"deploy index.js --no-bundle --minify --dry-run --outdir dist"
			);
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m\`--minify\` and \`--no-bundle\` can't be used together. If you want to minify your Worker and disable Wrangler's bundling, please minify as part of your own bundling process.[0m

			"
		`);
		});

		it("should warn that no-bundle and minify can't be used together", async () => {
			writeWranglerConfig({
				no_bundle: true,
				minify: true,
			});
			const scriptContent = `
			const xyz = 123; // a statement that would otherwise be compiled out
		`;
			fs.writeFileSync("index.js", scriptContent);
			await runWrangler("deploy index.js --dry-run --outdir dist");
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m\`--minify\` and \`--no-bundle\` can't be used together. If you want to minify your Worker and disable Wrangler's bundling, please minify as part of your own bundling process.[0m

			"
		`);
		});
	});
	describe("source maps", () => {
		it("should include source map with bundle when upload_source_maps = true", async () => {
			writeWranglerConfig({
				main: "index.ts",
				upload_source_maps: true,
			});
			writeWorkerSource({ format: "ts" });
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedMainModule: "index.js",
				expectedModules: {
					"index.js.map": expect.stringMatching(
						/"sources":\["another.ts","index.ts"\],"sourceRoot":"".*"file":"index.js"/
					),
				},
			});

			await runWrangler("deploy");
		});

		it("should not include source map with bundle when upload_source_maps = false", async () => {
			writeWranglerConfig({
				main: "index.ts",
				upload_source_maps: false,
			});
			writeWorkerSource({ format: "ts" });

			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedMainModule: "index.js",
				expectedModules: {
					"index.js.map": null,
				},
			});

			await runWrangler("deploy");
		});

		it("should include source maps emitted by custom build when upload_source_maps = true", async () => {
			writeWranglerConfig({
				no_bundle: true,
				main: "index.js",
				upload_source_maps: true,
				build: {
					command: `echo "custom build script"`,
				},
			});
			fs.writeFileSync(
				"index.js",
				`export default { fetch() { return new Response("Hello World"); } }\n` +
					"//# sourceMappingURL=index.js.map"
			);
			fs.writeFileSync(
				"index.js.map",
				JSON.stringify({
					version: 3,
					sources: ["index.ts"],
					sourceRoot: "",
					file: "index.js",
				})
			);

			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedMainModule: "index.js",
				expectedModules: {
					"index.js.map": expect.stringMatching(
						/"sources":\["index.ts"\],"sourceRoot":"".*"file":"index.js"/
					),
				},
			});

			await runWrangler("deploy");
		});

		it("should not include source maps emitted by custom build when upload_source_maps = false", async () => {
			writeWranglerConfig({
				no_bundle: true,
				main: "index.js",
				upload_source_maps: false,
				build: {
					command: `echo "custom build script"`,
				},
			});
			fs.writeFileSync(
				"index.js",
				`export default { fetch() { return new Response("Hello World"); } }\n` +
					"//# sourceMappingURL=index.js.map"
			);
			fs.writeFileSync(
				"index.js.map",
				JSON.stringify({
					version: 3,
					file: "index.js",
					sources: ["index.ts"],
					sourceRoot: "",
				})
			);

			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedMainModule: "index.js",
				expectedModules: {
					"index.js.map": null,
				},
			});

			await runWrangler("deploy");
		});
		it("should correctly read sourcemaps with custom wrangler.toml location", async () => {
			fs.mkdirSync("some/dir", { recursive: true });
			writeWranglerConfig(
				{
					main: "../../index.ts",
					upload_source_maps: true,
				},
				"some/dir/wrangler.toml"
			);
			writeWorkerSource({ format: "ts" });

			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedMainModule: "index.js",
				expectedModules: {
					"index.js.map": expect.stringMatching(
						/"sources":\[".*?another\.ts",".*?index\.ts"\],"sourceRoot":"".*"file":"index.js"/
					),
				},
			});

			await runWrangler("deploy -c some/dir/wrangler.toml");
		});
	});
});
