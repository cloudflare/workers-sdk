/* eslint-disable workers-sdk/no-vitest-import-expect */

import * as fs from "node:fs";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getInstalledPackageVersion } from "../../autoconfig/frameworks/utils/packages";
import { clearOutputFilePath } from "../../output";
import { fetchSecrets } from "../../utils/fetch-secrets";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockLegacyScriptData } from "../helpers/mock-legacy-script";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import { mockSubDomainRequest } from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import {
	mockDeploymentsListRequest,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
	mockServiceScriptData,
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

	describe("durable object migrations", () => {
		it("should warn when you try to deploy durable objects without migrations", async () => {
			writeWranglerConfig({
				durable_objects: {
					bindings: [{ name: "SOMENAME", class_name: "SomeClass" }],
				},
			});
			fs.writeFileSync(
				"index.js",
				`export class SomeClass{}; export default {};`
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                       Resource
				env.SOMENAME (SomeClass)      Durable Object

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - In your wrangler.toml file, you have configured \`durable_objects\` exported by this Worker
				  (SomeClass), but no \`migrations\` for them. This may not work as expected until you add a
				  \`migrations\` section to your wrangler.toml file. Add the following configuration:

				      \`\`\`
				      [[migrations]]
				      tag = "v1"
				      new_sqlite_classes = [ "SomeClass" ]

				      \`\`\`

				      Refer to
				  [4mhttps://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/[0m for more
				  details.

				"
			`);
		});

		it("does not warn if all the durable object bindings are to external classes", async () => {
			writeWranglerConfig({
				durable_objects: {
					bindings: [
						{
							name: "SOMENAME",
							class_name: "SomeClass",
							script_name: "some-script",
						},
					],
				},
			});
			fs.writeFileSync(
				"index.js",
				`export class SomeClass{}; export default {};`
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                                               Resource
				env.SOMENAME (SomeClass, defined in some-script)      Durable Object

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should deploy all migrations on first deploy", async () => {
			writeWranglerConfig({
				durable_objects: {
					bindings: [
						{ name: "SOMENAME", class_name: "SomeClass" },
						{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
					],
				},
				migrations: [
					{ tag: "v1", new_classes: ["SomeClass"] },
					{ tag: "v2", new_classes: ["SomeOtherClass"] },
				],
			});
			fs.writeFileSync(
				"index.js",
				`export class SomeClass{}; export class SomeOtherClass{}; export default {};`
			);
			mockSubDomainRequest();
			mockLegacyScriptData({ scripts: [] }); // no previously uploaded scripts at all
			mockUploadWorkerRequest({
				expectedMigrations: {
					new_tag: "v2",
					steps: [
						{ new_classes: ["SomeClass"] },
						{ new_classes: ["SomeOtherClass"] },
					],
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
				Your Worker has access to the following bindings:
				Binding                                 Resource
				env.SOMENAME (SomeClass)                Durable Object
				env.SOMEOTHERNAME (SomeOtherClass)      Durable Object

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should upload migrations past a previously uploaded tag", async () => {
			writeWranglerConfig({
				durable_objects: {
					bindings: [
						{ name: "SOMENAME", class_name: "SomeClass" },
						{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
					],
				},
				migrations: [
					{ tag: "v1", new_classes: ["SomeClass"] },
					{ tag: "v2", new_classes: ["SomeOtherClass"] },
				],
			});
			fs.writeFileSync(
				"index.js",
				`export class SomeClass{}; export class SomeOtherClass{}; export default {};`
			);
			mockSubDomainRequest();
			mockLegacyScriptData({
				scripts: [{ id: "test-name", migration_tag: "v1" }],
			});
			mockUploadWorkerRequest({
				expectedMigrations: {
					old_tag: "v1",
					new_tag: "v2",
					steps: [
						{
							new_classes: ["SomeOtherClass"],
						},
					],
				},
				useOldUploadApi: true,
			});

			await runWrangler("deploy index.js");
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
				Binding                                 Resource
				env.SOMENAME (SomeClass)                Durable Object
				env.SOMEOTHERNAME (SomeOtherClass)      Durable Object

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});

		it("should not send migrations if they've all already been sent", async () => {
			writeWranglerConfig({
				durable_objects: {
					bindings: [
						{ name: "SOMENAME", class_name: "SomeClass" },
						{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
					],
				},
				migrations: [
					{ tag: "v1", new_classes: ["SomeClass"] },
					{ tag: "v2", new_classes: ["SomeOtherClass"] },
					{ tag: "v3", new_classes: ["YetAnotherClass"] },
				],
			});
			fs.writeFileSync(
				"index.js",
				`export class SomeClass{}; export class SomeOtherClass{}; export class YetAnotherClass{}; export default {};`
			);
			mockSubDomainRequest();
			mockLegacyScriptData({
				scripts: [{ id: "test-name", migration_tag: "v3" }],
			});
			mockUploadWorkerRequest({
				expectedMigrations: undefined,
			});

			await runWrangler("deploy index.js");
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
				Binding                                 Resource
				env.SOMENAME (SomeClass)                Durable Object
				env.SOMEOTHERNAME (SomeOtherClass)      Durable Object

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});

		describe("service environments", () => {
			it("should deploy all migrations on first deploy", async () => {
				writeWranglerConfig({
					durable_objects: {
						bindings: [
							{ name: "SOMENAME", class_name: "SomeClass" },
							{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
						],
					},
					migrations: [
						{ tag: "v1", new_classes: ["SomeClass"] },
						{ tag: "v2", new_classes: ["SomeOtherClass"] },
					],
				});
				fs.writeFileSync(
					"index.js",
					`export class SomeClass{}; export class SomeOtherClass{}; export default {};`
				);
				mockSubDomainRequest();
				mockServiceScriptData({}); // no scripts at all
				mockUploadWorkerRequest({
					useServiceEnvironments: true,
					expectedMigrations: {
						new_tag: "v2",
						steps: [
							{ new_classes: ["SomeClass"] },
							{ new_classes: ["SomeOtherClass"] },
						],
					},
					useOldUploadApi: true,
				});

				await runWrangler("deploy index.js --legacy-env false");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                 Resource
					env.SOMENAME (SomeClass)                Durable Object
					env.SOMEOTHERNAME (SomeOtherClass)      Durable Object

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

					    - Service environments are deprecated, and will be removed in the future. DO NOT USE IN
					  PRODUCTION.

					"
				`);
			});

			it("should deploy all migrations on first deploy (--env)", async () => {
				writeWranglerConfig({
					durable_objects: {
						bindings: [
							{ name: "SOMENAME", class_name: "SomeClass" },
							{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
						],
					},
					env: {
						xyz: {
							durable_objects: {
								bindings: [
									{ name: "SOMENAME", class_name: "SomeClass" },
									{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
								],
							},
						},
					},
					migrations: [
						{ tag: "v1", new_classes: ["SomeClass"] },
						{ tag: "v2", new_classes: ["SomeOtherClass"] },
					],
				});
				fs.writeFileSync(
					"index.js",
					`export class SomeClass{}; export class SomeOtherClass{}; export default {};`
				);
				mockSubDomainRequest();
				mockServiceScriptData({ env: "xyz" }); // no scripts at all
				mockUploadWorkerRequest({
					useServiceEnvironments: true,
					env: "xyz",
					expectedMigrations: {
						new_tag: "v2",
						steps: [
							{ new_classes: ["SomeClass"] },
							{ new_classes: ["SomeOtherClass"] },
						],
					},
					useOldUploadApi: true,
				});

				await runWrangler("deploy index.js --legacy-env false --env xyz");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                 Resource
					env.SOMENAME (SomeClass)                Durable Object
					env.SOMEOTHERNAME (SomeOtherClass)      Durable Object

					Uploaded test-name (xyz) (TIMINGS)
					Deployed test-name (xyz) triggers (TIMINGS)
					  https://xyz.test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

					    - Service environments are deprecated, and will be removed in the future. DO NOT USE IN
					  PRODUCTION.

					"
				`);
			});

			it("should use a script's current migration tag when publishing migrations", async () => {
				writeWranglerConfig({
					durable_objects: {
						bindings: [
							{ name: "SOMENAME", class_name: "SomeClass" },
							{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
						],
					},
					migrations: [
						{ tag: "v1", new_classes: ["SomeClass"] },
						{ tag: "v2", new_classes: ["SomeOtherClass"] },
					],
				});
				fs.writeFileSync(
					"index.js",
					`export class SomeClass{}; export class SomeOtherClass{}; export default {};`
				);
				mockSubDomainRequest();
				mockServiceScriptData({
					script: { id: "test-name", migration_tag: "v2" },
				});
				mockUploadWorkerRequest({
					useServiceEnvironments: true,
					expectedMigrations: {
						new_tag: "v2",
						steps: [
							{
								new_classes: ["SomeClass"],
							},
							{
								new_classes: ["SomeOtherClass"],
							},
						],
					},
					useOldUploadApi: true,
				});

				await runWrangler("deploy index.js --legacy-env false");
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
					Binding                                 Resource
					env.SOMENAME (SomeClass)                Durable Object
					env.SOMEOTHERNAME (SomeOtherClass)      Durable Object

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class",
					  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

					    - Service environments are deprecated, and will be removed in the future. DO NOT USE IN
					  PRODUCTION.

					",
					}
				`);
			});

			it("should use an environment's current migration tag when publishing migrations", async () => {
				writeWranglerConfig({
					durable_objects: {
						bindings: [
							{ name: "SOMENAME", class_name: "SomeClass" },
							{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
						],
					},
					env: {
						xyz: {
							durable_objects: {
								bindings: [
									{ name: "SOMENAME", class_name: "SomeClass" },
									{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
								],
							},
						},
					},
					migrations: [
						{ tag: "v1", new_classes: ["SomeClass"] },
						{ tag: "v2", new_classes: ["SomeOtherClass"] },
					],
				});
				fs.writeFileSync(
					"index.js",
					`export class SomeClass{}; export class SomeOtherClass{}; export default {};`
				);
				mockSubDomainRequest();
				mockServiceScriptData({
					script: { id: "test-name", migration_tag: "v1" },
					env: "xyz",
				});
				mockUploadWorkerRequest({
					useServiceEnvironments: true,
					env: "xyz",
					expectedMigrations: {
						old_tag: "v1",
						new_tag: "v2",
						steps: [
							{
								new_classes: ["SomeOtherClass"],
							},
						],
					},
					useOldUploadApi: true,
				});

				await runWrangler("deploy index.js --legacy-env false --env xyz");
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
					Binding                                 Resource
					env.SOMENAME (SomeClass)                Durable Object
					env.SOMEOTHERNAME (SomeOtherClass)      Durable Object

					Uploaded test-name (xyz) (TIMINGS)
					Deployed test-name (xyz) triggers (TIMINGS)
					  https://xyz.test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class",
					  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

					    - Service environments are deprecated, and will be removed in the future. DO NOT USE IN
					  PRODUCTION.

					",
					}
				`);
			});
		});

		describe("dispatch namespaces", () => {
			it("should deploy all migrations on first deploy", async () => {
				writeWranglerConfig({
					durable_objects: {
						bindings: [
							{ name: "SOMENAME", class_name: "SomeClass" },
							{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
						],
					},
					migrations: [
						{ tag: "v1", new_classes: ["SomeClass"] },
						{ tag: "v2", new_classes: ["SomeOtherClass"] },
					],
				});
				fs.writeFileSync(
					"index.js",
					`export class SomeClass{}; export class SomeOtherClass{}; export default {};`
				);
				mockSubDomainRequest();
				mockServiceScriptData({
					dispatchNamespace: "test-namespace",
				}); // no scripts at all
				mockUploadWorkerRequest({
					expectedMigrations: {
						new_tag: "v2",
						steps: [
							{ new_classes: ["SomeClass"] },
							{ new_classes: ["SomeOtherClass"] },
						],
					},
					useOldUploadApi: true,
					expectedDispatchNamespace: "test-namespace",
				});

				await runWrangler(
					"deploy index.js --dispatch-namespace test-namespace"
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                 Resource
					env.SOMENAME (SomeClass)                Durable Object
					env.SOMEOTHERNAME (SomeOtherClass)      Durable Object

					Uploaded test-name (TIMINGS)
					  Dispatch Namespace: test-namespace
					Current Version ID: Galaxy-Class"
				`);
			});

			it("should use a script's current migration tag when publishing migrations", async () => {
				writeWranglerConfig({
					durable_objects: {
						bindings: [
							{ name: "SOMENAME", class_name: "SomeClass" },
							{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
						],
					},
					migrations: [
						{ tag: "v1", new_classes: ["SomeClass"] },
						{ tag: "v2", new_classes: ["SomeOtherClass"] },
					],
				});
				fs.writeFileSync(
					"index.js",
					`export class SomeClass{}; export class SomeOtherClass{}; export default {};`
				);
				mockSubDomainRequest();
				mockServiceScriptData({
					script: { id: "test-name", migration_tag: "v1" },
					dispatchNamespace: "test-namespace",
				});
				mockUploadWorkerRequest({
					expectedMigrations: {
						old_tag: "v1",
						new_tag: "v2",
						steps: [
							{
								new_classes: ["SomeOtherClass"],
							},
						],
					},
					useOldUploadApi: true,
					expectedDispatchNamespace: "test-namespace",
				});

				await runWrangler(
					"deploy index.js --dispatch-namespace test-namespace"
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                 Resource
					env.SOMENAME (SomeClass)                Durable Object
					env.SOMEOTHERNAME (SomeOtherClass)      Durable Object

					Uploaded test-name (TIMINGS)
					  Dispatch Namespace: test-namespace
					Current Version ID: Galaxy-Class"
				`);
			});
		});
	});
	describe("tail consumers", () => {
		it("should allow specifying workers as tail consumers", async () => {
			writeWranglerConfig({
				tail_consumers: [
					{ service: "listener " },
					{ service: "test-listener", environment: "production" },
				],
				streaming_tail_consumers: [{ service: "stream-listener " }],
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedTailConsumers: [
					{ service: "listener " },
					{ service: "test-listener", environment: "production" },
				],
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker is sending Tail events to the following Workers:
				- listener
				- test-listener
				- stream-listener  (streaming)
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});
	});
	describe("user limits", () => {
		it("should allow specifying a cpu millisecond limit", async () => {
			writeWranglerConfig({
				limits: { cpu_ms: 15_000 },
			});

			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedLimits: { cpu_ms: 15_000 },
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
		});

		it("should allow specifying a subrequests limit", async () => {
			writeWranglerConfig({
				limits: { subrequests: 100 },
			});

			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedLimits: { subrequests: 100 },
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
		});
	});
	describe("ai", () => {
		it("should upload ai bindings", async () => {
			writeWranglerConfig({
				ai: { binding: "AI_BIND" },
				browser: { binding: "MYBROWSER" },
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "browser",
						name: "MYBROWSER",
					},
					{
						type: "ai",
						name: "AI_BIND",
					},
				],
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding               Resource
				env.MYBROWSER         Browser
				env.AI_BIND           AI

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});
	});
	describe("images", () => {
		it("should upload images bindings", async () => {
			writeWranglerConfig({
				images: { binding: "IMAGES_BIND" },
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "images",
						name: "IMAGES_BIND",
					},
				],
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                 Resource
				env.IMAGES_BIND         Images

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});
	});
	describe("python", () => {
		it("should upload python module defined in wrangler.toml", async () => {
			writeWranglerConfig({
				main: "index.py",
				compatibility_flags: ["python_workers"],
			});
			const expectedModules = {
				"index.py":
					"from js import Response;\ndef fetch(request):\n return Response.new('hello')",
			};
			await fs.promises.writeFile("index.py", expectedModules["index.py"]);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedMainModule: "index.py",
				expectedModules,
			});

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
		});

		it("should print vendor modules correctly in table", async () => {
			writeWranglerConfig({
				main: "src/index.py",
				compatibility_flags: ["python_workers"],
				// python_modules.exclude is set to `**/*.pyc` by default
			});

			// Create main Python file
			const mainPython =
				"from js import Response;\ndef fetch(request):\n return Response.new('hello')";
			await fs.promises.mkdir("src", { recursive: true });
			await fs.promises.writeFile("src/index.py", mainPython);

			// Create vendor directory and files
			await fs.promises.mkdir("python_modules", { recursive: true });
			await fs.promises.writeFile(
				"python_modules/module1.so",
				"binary content for module 1"
			);
			await fs.promises.writeFile(
				"python_modules/module2.py",
				"# Python vendor module 2\nprint('hello')"
			);

			await fs.promises.writeFile(
				"python_modules/test.pyc",
				"this shouldn't be deployed"
			);
			await fs.promises.mkdir("python_modules/other", { recursive: true });
			await fs.promises.writeFile(
				"python_modules/other/test.pyc",
				"this shouldn't be deployed"
			);

			// Create a regular Python module
			await fs.promises.writeFile(
				"src/helper.py",
				"# Helper module\ndef helper(): pass"
			);

			const expectedModules = {
				"index.py": mainPython,
				"helper.py": "# Helper module\ndef helper(): pass",
				"python_modules/module1.so": "binary content for module 1",
				"python_modules/module2.py": "# Python vendor module 2\nprint('hello')",
			};

			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedMainModule: "index.py",
				expectedModules,
				excludedModules: [
					"python_modules/test.pyc",
					"python_modules/other/test.pyc",
				],
			});

			await runWrangler("deploy");

			// Check that the table output shows vendor modules aggregated correctly
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				┌─┬─┬─┐
				│ Name │ Type │ Size │
				├─┼─┼─┤
				│ helper.py │ python │ xx KiB │
				├─┼─┼─┤
				│ Vendored Modules │ │ xx KiB │
				├─┼─┼─┤
				│ Total (3 modules) │ │ xx KiB │
				└─┴─┴─┘
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should upload python module specified in CLI args", async () => {
			writeWranglerConfig({
				compatibility_flags: ["python_workers"],
			});
			const expectedModules = {
				"index.py":
					"from js import Response;\ndef fetch(request):\n return Response.new('hello')",
			};
			await fs.promises.writeFile("index.py", expectedModules["index.py"]);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedMainModule: "index.py",
				expectedModules,
			});

			await runWrangler("deploy index.py");
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
		});
	});
	describe("hyperdrive", () => {
		it("should upload hyperdrive bindings", async () => {
			writeWranglerConfig({
				hyperdrive: [
					{
						binding: "HYPERDRIVE",
						id: "343cd4f1d58c42fbb5bd082592fd7143",
					},
				],
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "hyperdrive",
						name: "HYPERDRIVE",
						id: "343cd4f1d58c42fbb5bd082592fd7143",
					},
				],
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                                                Resource
				env.HYPERDRIVE (343cd4f1d58c42fbb5bd082592fd7143)      Hyperdrive Config

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});
	});
	describe("vpc_services", () => {
		it("should upload VPC services bindings", async () => {
			writeWranglerConfig({
				vpc_services: [
					{
						binding: "VPC_SERVICE",
						service_id: "0199295b-b3ac-7760-8246-bca40877b3e9",
					},
				],
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "vpc_service",
						name: "VPC_SERVICE",
						service_id: "0199295b-b3ac-7760-8246-bca40877b3e9",
					},
				],
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                                                     Resource
				env.VPC_SERVICE (0199295b-b3ac-7760-8246-bca40877b3e9)      VPC Service

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should upload multiple VPC services bindings", async () => {
			writeWranglerConfig({
				vpc_services: [
					{
						binding: "VPC_API",
						service_id: "0199295b-b3ac-7760-8246-bca40877b3e9",
					},
					{
						binding: "VPC_DATABASE",
						service_id: "0299295b-b3ac-7760-8246-bca40877b3e0",
					},
				],
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "vpc_service",
						name: "VPC_API",
						service_id: "0199295b-b3ac-7760-8246-bca40877b3e9",
					},
					{
						type: "vpc_service",
						name: "VPC_DATABASE",
						service_id: "0299295b-b3ac-7760-8246-bca40877b3e0",
					},
				],
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                                                      Resource
				env.VPC_API (0199295b-b3ac-7760-8246-bca40877b3e9)           VPC Service
				env.VPC_DATABASE (0299295b-b3ac-7760-8246-bca40877b3e0)      VPC Service

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});
	});
	describe("mtls_certificates", () => {
		it("should upload mtls_certificate bindings", async () => {
			writeWranglerConfig({
				mtls_certificates: [{ binding: "CERT_ONE", certificate_id: "1234" }],
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "mtls_certificate",
						name: "CERT_ONE",
						certificate_id: "1234",
					},
				],
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                  Resource
				env.CERT_ONE (1234)      mTLS Certificate

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});
	});
	describe("pipelines", () => {
		it("should upload pipelines bindings", async () => {
			writeWranglerConfig({
				pipelines: [
					{
						binding: "MY_PIPELINE",
						pipeline: "my-pipeline",
					},
				],
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "pipelines",
						name: "MY_PIPELINE",
						pipeline: "my-pipeline",
					},
				],
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                            Resource
				env.MY_PIPELINE (my-pipeline)      Pipeline

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});
	});
	describe("secrets_store_secrets", () => {
		it("should upload secret store bindings", async () => {
			writeWranglerConfig({
				secrets_store_secrets: [
					{
						binding: "SECRET",
						store_id: "store_id",
						secret_name: "secret_name",
					},
				],
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "secrets_store_secret",
						name: "SECRET",
						store_id: "store_id",
						secret_name: "secret_name",
					},
				],
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                                Resource
				env.SECRET (store_id/secret_name)      Secrets Store Secret

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});
	});
});
