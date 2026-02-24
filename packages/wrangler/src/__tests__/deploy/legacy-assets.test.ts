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
	checkAssetUpload,
	mockDeleteUnusedAssetsRequest,
	mockDeploymentsListRequest,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
	mockUploadAssetsToKVRequest,
	writeAssets,
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

	describe("(legacy) asset upload", () => {
		it("should upload all the files in the directory specified by `config.site.bucket`", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
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
			await runWrangler("deploy");

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
		});

		it("should not contain backslash for assets with nested directories", async () => {
			const assets = [
				{ filePath: "subdir/file-1.txt", content: "Content of file-1" },
				{ filePath: "subdir/file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "__STATIC_CONTENT",
						namespace_id: "__test-name-workers_sites_assets-id",
						type: "kv_namespace",
					},
				],
				expectedModules: {
					__STATIC_CONTENT_MANIFEST:
						'{"subdir/file-1.txt":"subdir/file-1.2ca234f380.txt","subdir/file-2.txt":"subdir/file-2.5938485188.txt"}',
				},
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);

			await runWrangler("deploy");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + subdir/file-1.2ca234f380.txt (uploading new version of subdir/file-1.txt)
			 + subdir/file-2.5938485188.txt (uploading new version of subdir/file-2.txt)
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
		});

		it("when using a service-worker type, it should add an asset manifest as a text_blob, and bind to a namespace", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource({ type: "sw" });
			writeAssets(assets);
			mockUploadWorkerRequest({
				expectedType: "sw",
				expectedModules: {
					__STATIC_CONTENT_MANIFEST:
						'{"file-1.txt":"file-1.2ca234f380.txt","file-2.txt":"file-2.5938485188.txt"}',
				},
				expectedBindings: [
					{
						name: "__STATIC_CONTENT",
						namespace_id: "__test-name-workers_sites_assets-id",
						type: "kv_namespace",
					},
					{
						name: "__STATIC_CONTENT_MANIFEST",
						part: "__STATIC_CONTENT_MANIFEST",
						type: "text_blob",
					},
				],
				useOldUploadApi: true,
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);

			await runWrangler("deploy");

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
		});

		it("when using a module worker type, it should add an asset manifest module, and bind to a namespace", async () => {
			const assets = [
				// Using `.text` extension instead of `.txt` means files won't be
				// treated as additional modules
				{ filePath: "file-1.text", content: "Content of file-1" },
				{ filePath: "file-2.text", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
				find_additional_modules: true,
				rules: [{ type: "ESModule", globs: ["**/*.mjs"] }],
			});
			// Create a Worker that imports a CommonJS module to trigger esbuild to add
			// extra boilerplate to convert to ESM imports.
			fs.writeFileSync(`another.cjs`, `module.exports.foo = 100;`);
			fs.writeFileSync(
				`index.js`,
				`import { foo } from "./another.cjs";
					export default {
						async fetch(request) {
							return new Response('Hello' + foo);
						},
					};`
			);
			fs.mkdirSync("a/b/c", { recursive: true });
			fs.writeFileSync(
				"a/1.mjs",
				'export { default } from "__STATIC_CONTENT_MANIFEST";'
			);
			fs.writeFileSync(
				"a/b/2.mjs",
				'export { default } from "__STATIC_CONTENT_MANIFEST";'
			);
			fs.writeFileSync(
				"a/b/3.mjs",
				'export { default } from "__STATIC_CONTENT_MANIFEST";'
			);
			fs.writeFileSync(
				"a/b/c/4.mjs",
				'export { default } from "__STATIC_CONTENT_MANIFEST";'
			);
			writeAssets(assets);
			mockUploadWorkerRequest({
				expectedEntry(entry) {
					// Ensure that we have not included the watch stub in production code.
					// This is only needed in `wrangler dev`.
					expect(entry).not.toMatch(/modules-watch-stub\.js/);
				},
				expectedBindings: [
					{
						name: "__STATIC_CONTENT",
						namespace_id: "__test-name-workers_sites_assets-id",
						type: "kv_namespace",
					},
				],
				expectedModules: {
					__STATIC_CONTENT_MANIFEST:
						'{"file-1.text":"file-1.2ca234f380.text","file-2.text":"file-2.5938485188.text"}',
					"a/__STATIC_CONTENT_MANIFEST":
						'export { default } from "../__STATIC_CONTENT_MANIFEST";',
					"a/b/__STATIC_CONTENT_MANIFEST":
						'export { default } from "../../__STATIC_CONTENT_MANIFEST";',
					"a/b/c/__STATIC_CONTENT_MANIFEST":
						'export { default } from "../../../__STATIC_CONTENT_MANIFEST";',
				},
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);

			await runWrangler("deploy");

			expect(std.info).toMatchInlineSnapshot(`
			"Attaching additional modules:
			Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.text (uploading new version of file-1.text)
			 + file-2.5938485188.text (uploading new version of file-2.text)
			Uploading 2 new assets...
			Uploaded 100% [2 out of 2]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				┌─┬─┬─┐
				│ Name │ Type │ Size │
				├─┼─┼─┤
				│ a/1.mjs │ esm │ xx KiB │
				├─┼─┼─┤
				│ a/b/2.mjs │ esm │ xx KiB │
				├─┼─┼─┤
				│ a/b/3.mjs │ esm │ xx KiB │
				├─┼─┼─┤
				│ a/b/c/4.mjs │ esm │ xx KiB │
				├─┼─┼─┤
				│ Total (4 modules) │ │ xx KiB │
				└─┴─┴─┘
				↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should make environment specific kv namespace for assets, even for service envs", async () => {
			// This is the same test as the one before this, but with an env arg
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-some-env-workers_sites_assets",
				id: "__test-name-some-env-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
				env: { "some-env": {} },
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest({
				env: "some-env",
				expectedBindings: [
					{
						name: "__STATIC_CONTENT",
						namespace_id: "__test-name-some-env-workers_sites_assets-id",
						type: "kv_namespace",
					},
				],
				useOldUploadApi: true,
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);
			await runWrangler("deploy --env some-env --legacy-env false");

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
				Uploaded test-name (some-env) (TIMINGS)
				Deployed test-name (some-env) triggers (TIMINGS)
				  https://some-env.test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should make environment specific kv namespace for assets, even for wrangler environments", async () => {
			// And this is the same test as the one before this, but with useServiceEnvironments:false
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-some-env-workers_sites_assets",
				id: "__test-name-some-env-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
				env: { "some-env": {} },
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest({
				useServiceEnvironments: false,
				env: "some-env",
				expectedBindings: [
					{
						name: "__STATIC_CONTENT",
						namespace_id: "__test-name-some-env-workers_sites_assets-id",
						type: "kv_namespace",
					},
				],
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);
			await runWrangler("deploy --env some-env --legacy-env true");

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
				Uploaded test-name-some-env (TIMINGS)
				Deployed test-name-some-env triggers (TIMINGS)
				  https://test-name-some-env.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should only upload files that are not already in the KV namespace", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			// Put file-1 in the KV namespace
			mockKeyListRequest(kvNamespace.id, [{ name: "file-1.2ca234f380.txt" }]);
			// Check we do not upload file-1
			mockUploadAssetsToKVRequest(
				kvNamespace.id,
				assets.filter((a) => a.filePath !== "file-1.txt")
			);
			await runWrangler("deploy");

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
		});

		it("should only upload files that match the `site-include` arg", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			// Check we only upload file-1
			mockUploadAssetsToKVRequest(
				kvNamespace.id,
				assets.filter((a) => a.filePath === "file-1.txt")
			);
			await runWrangler("deploy --site-include file-1.txt");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			Uploading 1 new asset...
			Uploaded 100% [1 out of 1]"
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
		});

		it("should not upload files that match the `site-exclude` arg", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			// Check we only upload file-1
			mockUploadAssetsToKVRequest(
				kvNamespace.id,
				assets.filter((a) => a.filePath === "file-1.txt")
			);
			await runWrangler("deploy --site-exclude file-2.txt");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			Uploading 1 new asset...
			Uploaded 100% [1 out of 1]"
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
		});

		it("should only upload files that match the `site.include` config", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
					include: ["file-1.txt"],
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			// Check we only upload file-1
			mockUploadAssetsToKVRequest(
				kvNamespace.id,
				assets.filter((a) => a.filePath === "file-1.txt")
			);
			await runWrangler("deploy");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			Uploading 1 new asset...
			Uploaded 100% [1 out of 1]"
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
		});

		it("should not upload files that match the `site.exclude` config", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
					exclude: ["file-2.txt"],
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			// Check we only upload file-1
			mockUploadAssetsToKVRequest(
				kvNamespace.id,
				assets.filter((a) => a.filePath === "file-1.txt")
			);
			await runWrangler("deploy");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			Uploading 1 new asset...
			Uploaded 100% [1 out of 1]"
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
		});

		it("should use `site-include` arg over `site.include` config", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
					include: ["file-2.txt"],
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			// Check we only upload file-1
			mockUploadAssetsToKVRequest(
				kvNamespace.id,
				assets.filter((a) => a.filePath === "file-1.txt")
			);
			await runWrangler("deploy --site-include file-1.txt");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			Uploading 1 new asset...
			Uploaded 100% [1 out of 1]"
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
		});

		it("should use `site-exclude` arg over `site.exclude` config", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
					exclude: ["file-1.txt"],
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			// Check we only upload file-1
			mockUploadAssetsToKVRequest(
				kvNamespace.id,
				assets.filter((a) => a.filePath.endsWith("file-1.txt"))
			);
			await runWrangler("deploy --site-exclude file-2.txt");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			Uploading 1 new asset...
			Uploaded 100% [1 out of 1]"
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
		});

		it("should walk directories except node_modules", async () => {
			const assets = [
				{
					filePath: "directory-1/file-1.txt",
					content: "Content of file-1",
				},
				{
					filePath: "node_modules/file-2.txt",
					content: "Content of file-2",
				},
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			// Only expect file-1 to be uploaded
			mockUploadAssetsToKVRequest(kvNamespace.id, assets.slice(0, 1));
			await runWrangler("deploy");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + directory-1/file-1.2ca234f380.txt (uploading new version of directory-1/file-1.txt)
			Uploading 1 new asset...
			Uploaded 100% [1 out of 1]"
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
		});

		it("should skip hidden files and directories except `.well-known`", async () => {
			const assets = [
				{
					filePath: ".hidden-file.txt",
					content: "Content of hidden-file",
				},
				{
					filePath: ".hidden/file-1.txt",
					content: "Content of file-1",
				},
				{
					filePath: ".well-known/file-2.txt",
					content: "Content of file-2",
				},
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			// Only expect file-2 to be uploaded
			mockUploadAssetsToKVRequest(kvNamespace.id, assets.slice(2));
			await runWrangler("deploy");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + .well-known/file-2.5938485188.txt (uploading new version of .well-known/file-2.txt)
			Uploading 1 new asset...
			Uploaded 100% [1 out of 1]"
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
		});

		it("should error if the asset is over 25Mb", async () => {
			const assets = [
				{
					filePath: "large-file.txt",
					// This file is greater than 25MiB when base64 encoded but small enough to be uploaded.
					content: "X".repeat(25 * 1024 * 1024 * 0.8 + 1),
				},
				{
					filePath: "too-large-file.txt",
					content: "X".repeat(25 * 1024 * 1024 + 1),
				},
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
					exclude: ["file-1.txt"],
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);

			await expect(
				runWrangler("deploy")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: File too-large-file.txt is too big, it should be under 25 MiB. See https://developers.cloudflare.com/workers/platform/limits#kv-limits]`
			);

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + large-file.0ea0637a45.txt (uploading new version of large-file.txt)"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				"
			`);
			expect(std.err).toMatchInlineSnapshot(`
			        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mFile too-large-file.txt is too big, it should be under 25 MiB. See https://developers.cloudflare.com/workers/platform/limits#kv-limits[0m

			        "
		      `);
		});

		it("should batch assets in groups <100 mb", async () => {
			// Let's have 20 files, from size 1 - 20 mb
			const assets = Array.from({ length: 20 }, (_, index) => ({
				filePath: `file-${`${index}`.padStart(2, "0")}.txt`,
				content: "X".repeat(1024 * 1024 * (index + 1)),
			}));

			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			const requests = mockUploadAssetsToKVRequest(kvNamespace.id);

			await runWrangler("deploy");

			// We expect this to be uploaded in 4 batches
			expect(requests.length).toEqual(4);
			// Buckets may be uploaded in any order, so sort them before we assert
			requests.sort((a, b) => a.uploads[0].key.localeCompare(b.uploads[0].key));
			// The first batch has 11 files
			expect(requests[0].uploads.length).toEqual(11);
			// The next batch has 5 files
			expect(requests[1].uploads.length).toEqual(5);
			// And the next one has 3 files
			expect(requests[2].uploads.length).toEqual(3);
			// And just 1 in the last batch
			expect(requests[3].uploads.length).toEqual(1);

			let assetIndex = 0;
			for (const request of requests) {
				for (const upload of request.uploads) {
					checkAssetUpload(assets[assetIndex], upload);
					assetIndex++;
				}
			}

			expect(std.debug).toMatchInlineSnapshot(`""`);
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
			// Mask all but last upload progress message as upload order unknown
			// (regexp replaces all single/double-digit percentages, i.e. not 100%)
			expect(std.info.replace(/Uploaded \d\d?% \[\d+/g, "Uploaded X% [X"))
				.toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-00.be5be5dd26.txt (uploading new version of file-00.txt)
			 + file-01.4842d35994.txt (uploading new version of file-01.txt)
			 + file-02.990572ec63.txt (uploading new version of file-02.txt)
			 + file-03.9d7dda9045.txt (uploading new version of file-03.txt)
			 + file-04.2b6fac6382.txt (uploading new version of file-04.txt)
			 + file-05.55762dc758.txt (uploading new version of file-05.txt)
			 + file-06.f408a6b020.txt (uploading new version of file-06.txt)
			 + file-07.64c051715b.txt (uploading new version of file-07.txt)
			 + file-08.d286789adb.txt (uploading new version of file-08.txt)
			 + file-09.6838c183a8.txt (uploading new version of file-09.txt)
			 + file-10.6e03221d2a.txt (uploading new version of file-10.txt)
			 + file-11.37d3fb2eff.txt (uploading new version of file-11.txt)
			 + file-12.b3556942f8.txt (uploading new version of file-12.txt)
			 + file-13.680caf51b1.txt (uploading new version of file-13.txt)
			 + file-14.51e88468f0.txt (uploading new version of file-14.txt)
			 + file-15.8e3fedb394.txt (uploading new version of file-15.txt)
			 + file-16.c81c5e426f.txt (uploading new version of file-16.txt)
			 + file-17.4b2ae3c47b.txt (uploading new version of file-17.txt)
			 + file-18.07f245e02b.txt (uploading new version of file-18.txt)
			 + file-19.f0d69f705d.txt (uploading new version of file-19.txt)
			Uploading 20 new assets...
			Uploaded X% [X out of 20]
			Uploaded X% [X out of 20]
			Uploaded X% [X out of 20]
			Uploaded 100% [20 out of 20]"
		`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		}, 30_000);

		it("should error if the asset key is over 512 characters", async () => {
			const longFilePathAsset = {
				filePath: "folder/".repeat(100) + "file.txt",
				content: "content of file",
			};
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets([longFilePathAsset]);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);

			await expect(
				runWrangler("deploy")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The asset path key "folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/file.3da0d0cd12.txt" exceeds the maximum key size limit of 512. See https://developers.cloudflare.com/workers/platform/limits#kv-limits",]`
			);

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload..."
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				"
			`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThe asset path key "folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/file.3da0d0cd12.txt" exceeds the maximum key size limit of 512. See https://developers.cloudflare.com/workers/platform/limits#kv-limits",[0m

				"
			`);
		});

		it("should delete uploaded assets that aren't included anymore", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, [
				// Put file-1 in the KV namespace
				{ name: "file-1.2ca234f380.txt" },
				// As well as a couple from a previous upload
				{ name: "file-3.somehash.txt" },
				{ name: "file-4.anotherhash.txt" },
			]);

			// we upload only file-1.txt
			mockUploadAssetsToKVRequest(
				kvNamespace.id,
				assets.filter((a) => a.filePath !== "file-1.txt")
			);

			// and mark file-3 and file-4 for deletion
			mockDeleteUnusedAssetsRequest(kvNamespace.id, [
				"file-3.somehash.txt",
				"file-4.anotherhash.txt",
			]);

			await runWrangler("deploy");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 = file-1.2ca234f380.txt (already uploaded file-1.txt)
			 + file-2.5938485188.txt (uploading new version of file-2.txt)
			 - file-3.somehash.txt (removing as stale)
			 - file-4.anotherhash.txt (removing as stale)
			Uploading 1 new asset...
			Skipped uploading 1 existing asset.
			Uploaded 100% [1 out of 1]
			Removing 2 stale assets..."
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
		});

		it("should generate an asset manifest with keys relative to site.bucket", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};

			writeWranglerConfig({
				main: "./src/index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource({ basePath: "src", type: "esm" });
			writeAssets(assets);
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "__STATIC_CONTENT",
						namespace_id: "__test-name-workers_sites_assets-id",
						type: "kv_namespace",
					},
				],
				expectedModules: {
					__STATIC_CONTENT_MANIFEST:
						'{"file-1.txt":"file-1.2ca234f380.txt","file-2.txt":"file-2.5938485188.txt"}',
				},
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);

			process.chdir("./src");
			await runWrangler("deploy");
			process.chdir("../");

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
		});

		it("should use the relative path from current working directory to Worker directory when using `--site`", async () => {
			writeWranglerConfig({
				main: "./index.js",
			});
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			writeAssets(assets, "my-assets");

			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};

			mockSubDomainRequest();
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);
			process.chdir("./my-assets");
			await runWrangler("deploy --site .");

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
				  "warn": "",
				}
			`);
		});

		it("should abort other bucket uploads if one bucket upload fails", async () => {
			// Write 9 20MiB files, should end up with 3 buckets
			const content = "X".repeat(20 * 1024 * 1024);
			const assets = Array.from({ length: 9 }, (_, index) => ({
				filePath: `file-${index}.txt`,
				content,
			}));

			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);

			let requestCount = 0;
			const bulkUrl =
				"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/bulk";
			msw.use(
				http.put(bulkUrl, async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.namespaceId).toEqual(kvNamespace.id);
					requestCount++;
					return HttpResponse.json(
						createFetchResult([], false, [
							{ code: 1000, message: "Whoops! Something went wrong!" },
						]),
						{ status: 500 }
					);
				})
			);

			await expect(
				runWrangler("deploy")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/storage/kv/namespaces/__test-name-workers_sites_assets-id/bulk) failed.]`
			);

			expect(requestCount).toBeLessThan(3);
			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-0.f0d69f705d.txt (uploading new version of file-0.txt)
			 + file-1.f0d69f705d.txt (uploading new version of file-1.txt)
			 + file-2.f0d69f705d.txt (uploading new version of file-2.txt)
			 + file-3.f0d69f705d.txt (uploading new version of file-3.txt)
			 + file-4.f0d69f705d.txt (uploading new version of file-4.txt)
			 + file-5.f0d69f705d.txt (uploading new version of file-5.txt)
			 + file-6.f0d69f705d.txt (uploading new version of file-6.txt)
			 + file-7.f0d69f705d.txt (uploading new version of file-7.txt)
			 + file-8.f0d69f705d.txt (uploading new version of file-8.txt)
			Uploading 9 new assets...
			Upload failed, aborting..."
		`);
		});

		describe("should truncate diff with over 100 assets unless debug log level set", () => {
			beforeEach(() => {
				const assets = Array.from({ length: 110 }, (_, index) => ({
					filePath: `file-${`${index}`.padStart(3, "0")}.txt`,
					content: "X",
				}));

				const kvNamespace = {
					title: "__test-name-workers_sites_assets",
					id: "__test-name-workers_sites_assets-id",
				};
				writeWranglerConfig({
					main: "./index.js",
					site: {
						bucket: "assets",
					},
				});
				writeWorkerSource();
				writeAssets(assets);
				mockUploadWorkerRequest();
				mockSubDomainRequest();
				mockListKVNamespacesRequest(kvNamespace);
				mockKeyListRequest(kvNamespace.id, []);
				mockUploadAssetsToKVRequest(kvNamespace.id);
			});

			it("default log level", async () => {
				await runWrangler("deploy");
				expect(std).toMatchInlineSnapshot(`
					{
					  "debug": "",
					  "err": "",
					  "info": "Fetching list of already uploaded assets...
					Building list of assets to upload...
					 + file-000.010257e8bb.txt (uploading new version of file-000.txt)
					 + file-001.010257e8bb.txt (uploading new version of file-001.txt)
					 + file-002.010257e8bb.txt (uploading new version of file-002.txt)
					 + file-003.010257e8bb.txt (uploading new version of file-003.txt)
					 + file-004.010257e8bb.txt (uploading new version of file-004.txt)
					 + file-005.010257e8bb.txt (uploading new version of file-005.txt)
					 + file-006.010257e8bb.txt (uploading new version of file-006.txt)
					 + file-007.010257e8bb.txt (uploading new version of file-007.txt)
					 + file-008.010257e8bb.txt (uploading new version of file-008.txt)
					 + file-009.010257e8bb.txt (uploading new version of file-009.txt)
					 + file-010.010257e8bb.txt (uploading new version of file-010.txt)
					 + file-011.010257e8bb.txt (uploading new version of file-011.txt)
					 + file-012.010257e8bb.txt (uploading new version of file-012.txt)
					 + file-013.010257e8bb.txt (uploading new version of file-013.txt)
					 + file-014.010257e8bb.txt (uploading new version of file-014.txt)
					 + file-015.010257e8bb.txt (uploading new version of file-015.txt)
					 + file-016.010257e8bb.txt (uploading new version of file-016.txt)
					 + file-017.010257e8bb.txt (uploading new version of file-017.txt)
					 + file-018.010257e8bb.txt (uploading new version of file-018.txt)
					 + file-019.010257e8bb.txt (uploading new version of file-019.txt)
					 + file-020.010257e8bb.txt (uploading new version of file-020.txt)
					 + file-021.010257e8bb.txt (uploading new version of file-021.txt)
					 + file-022.010257e8bb.txt (uploading new version of file-022.txt)
					 + file-023.010257e8bb.txt (uploading new version of file-023.txt)
					 + file-024.010257e8bb.txt (uploading new version of file-024.txt)
					 + file-025.010257e8bb.txt (uploading new version of file-025.txt)
					 + file-026.010257e8bb.txt (uploading new version of file-026.txt)
					 + file-027.010257e8bb.txt (uploading new version of file-027.txt)
					 + file-028.010257e8bb.txt (uploading new version of file-028.txt)
					 + file-029.010257e8bb.txt (uploading new version of file-029.txt)
					 + file-030.010257e8bb.txt (uploading new version of file-030.txt)
					 + file-031.010257e8bb.txt (uploading new version of file-031.txt)
					 + file-032.010257e8bb.txt (uploading new version of file-032.txt)
					 + file-033.010257e8bb.txt (uploading new version of file-033.txt)
					 + file-034.010257e8bb.txt (uploading new version of file-034.txt)
					 + file-035.010257e8bb.txt (uploading new version of file-035.txt)
					 + file-036.010257e8bb.txt (uploading new version of file-036.txt)
					 + file-037.010257e8bb.txt (uploading new version of file-037.txt)
					 + file-038.010257e8bb.txt (uploading new version of file-038.txt)
					 + file-039.010257e8bb.txt (uploading new version of file-039.txt)
					 + file-040.010257e8bb.txt (uploading new version of file-040.txt)
					 + file-041.010257e8bb.txt (uploading new version of file-041.txt)
					 + file-042.010257e8bb.txt (uploading new version of file-042.txt)
					 + file-043.010257e8bb.txt (uploading new version of file-043.txt)
					 + file-044.010257e8bb.txt (uploading new version of file-044.txt)
					 + file-045.010257e8bb.txt (uploading new version of file-045.txt)
					 + file-046.010257e8bb.txt (uploading new version of file-046.txt)
					 + file-047.010257e8bb.txt (uploading new version of file-047.txt)
					 + file-048.010257e8bb.txt (uploading new version of file-048.txt)
					 + file-049.010257e8bb.txt (uploading new version of file-049.txt)
					 + file-050.010257e8bb.txt (uploading new version of file-050.txt)
					 + file-051.010257e8bb.txt (uploading new version of file-051.txt)
					 + file-052.010257e8bb.txt (uploading new version of file-052.txt)
					 + file-053.010257e8bb.txt (uploading new version of file-053.txt)
					 + file-054.010257e8bb.txt (uploading new version of file-054.txt)
					 + file-055.010257e8bb.txt (uploading new version of file-055.txt)
					 + file-056.010257e8bb.txt (uploading new version of file-056.txt)
					 + file-057.010257e8bb.txt (uploading new version of file-057.txt)
					 + file-058.010257e8bb.txt (uploading new version of file-058.txt)
					 + file-059.010257e8bb.txt (uploading new version of file-059.txt)
					 + file-060.010257e8bb.txt (uploading new version of file-060.txt)
					 + file-061.010257e8bb.txt (uploading new version of file-061.txt)
					 + file-062.010257e8bb.txt (uploading new version of file-062.txt)
					 + file-063.010257e8bb.txt (uploading new version of file-063.txt)
					 + file-064.010257e8bb.txt (uploading new version of file-064.txt)
					 + file-065.010257e8bb.txt (uploading new version of file-065.txt)
					 + file-066.010257e8bb.txt (uploading new version of file-066.txt)
					 + file-067.010257e8bb.txt (uploading new version of file-067.txt)
					 + file-068.010257e8bb.txt (uploading new version of file-068.txt)
					 + file-069.010257e8bb.txt (uploading new version of file-069.txt)
					 + file-070.010257e8bb.txt (uploading new version of file-070.txt)
					 + file-071.010257e8bb.txt (uploading new version of file-071.txt)
					 + file-072.010257e8bb.txt (uploading new version of file-072.txt)
					 + file-073.010257e8bb.txt (uploading new version of file-073.txt)
					 + file-074.010257e8bb.txt (uploading new version of file-074.txt)
					 + file-075.010257e8bb.txt (uploading new version of file-075.txt)
					 + file-076.010257e8bb.txt (uploading new version of file-076.txt)
					 + file-077.010257e8bb.txt (uploading new version of file-077.txt)
					 + file-078.010257e8bb.txt (uploading new version of file-078.txt)
					 + file-079.010257e8bb.txt (uploading new version of file-079.txt)
					 + file-080.010257e8bb.txt (uploading new version of file-080.txt)
					 + file-081.010257e8bb.txt (uploading new version of file-081.txt)
					 + file-082.010257e8bb.txt (uploading new version of file-082.txt)
					 + file-083.010257e8bb.txt (uploading new version of file-083.txt)
					 + file-084.010257e8bb.txt (uploading new version of file-084.txt)
					 + file-085.010257e8bb.txt (uploading new version of file-085.txt)
					 + file-086.010257e8bb.txt (uploading new version of file-086.txt)
					 + file-087.010257e8bb.txt (uploading new version of file-087.txt)
					 + file-088.010257e8bb.txt (uploading new version of file-088.txt)
					 + file-089.010257e8bb.txt (uploading new version of file-089.txt)
					 + file-090.010257e8bb.txt (uploading new version of file-090.txt)
					 + file-091.010257e8bb.txt (uploading new version of file-091.txt)
					 + file-092.010257e8bb.txt (uploading new version of file-092.txt)
					 + file-093.010257e8bb.txt (uploading new version of file-093.txt)
					 + file-094.010257e8bb.txt (uploading new version of file-094.txt)
					 + file-095.010257e8bb.txt (uploading new version of file-095.txt)
					 + file-096.010257e8bb.txt (uploading new version of file-096.txt)
					 + file-097.010257e8bb.txt (uploading new version of file-097.txt)
					 + file-098.010257e8bb.txt (uploading new version of file-098.txt)
					 + file-099.010257e8bb.txt (uploading new version of file-099.txt)
					   (truncating changed assets log, set \`WRANGLER_LOG=debug\` environment variable to see full diff)
					Uploading 110 new assets...
					Uploaded 100% [110 out of 110]",
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
					  "warn": "",
					}
				`);
			});

			it("debug log level", async () => {
				vi.stubEnv("WRANGLER_LOG", "debug");
				vi.stubEnv("WRANGLER_LOG_SANITIZE", "false");

				await runWrangler("deploy");

				const diffRegexp = /^ [+=-]/;
				const diff = std.debug
					.split("\n")
					.filter((line) => diffRegexp.test(line))
					.join("\n");
				expect(diff).toMatchInlineSnapshot(`
			" + file-000.010257e8bb.txt (uploading new version of file-000.txt)
			 + file-001.010257e8bb.txt (uploading new version of file-001.txt)
			 + file-002.010257e8bb.txt (uploading new version of file-002.txt)
			 + file-003.010257e8bb.txt (uploading new version of file-003.txt)
			 + file-004.010257e8bb.txt (uploading new version of file-004.txt)
			 + file-005.010257e8bb.txt (uploading new version of file-005.txt)
			 + file-006.010257e8bb.txt (uploading new version of file-006.txt)
			 + file-007.010257e8bb.txt (uploading new version of file-007.txt)
			 + file-008.010257e8bb.txt (uploading new version of file-008.txt)
			 + file-009.010257e8bb.txt (uploading new version of file-009.txt)
			 + file-010.010257e8bb.txt (uploading new version of file-010.txt)
			 + file-011.010257e8bb.txt (uploading new version of file-011.txt)
			 + file-012.010257e8bb.txt (uploading new version of file-012.txt)
			 + file-013.010257e8bb.txt (uploading new version of file-013.txt)
			 + file-014.010257e8bb.txt (uploading new version of file-014.txt)
			 + file-015.010257e8bb.txt (uploading new version of file-015.txt)
			 + file-016.010257e8bb.txt (uploading new version of file-016.txt)
			 + file-017.010257e8bb.txt (uploading new version of file-017.txt)
			 + file-018.010257e8bb.txt (uploading new version of file-018.txt)
			 + file-019.010257e8bb.txt (uploading new version of file-019.txt)
			 + file-020.010257e8bb.txt (uploading new version of file-020.txt)
			 + file-021.010257e8bb.txt (uploading new version of file-021.txt)
			 + file-022.010257e8bb.txt (uploading new version of file-022.txt)
			 + file-023.010257e8bb.txt (uploading new version of file-023.txt)
			 + file-024.010257e8bb.txt (uploading new version of file-024.txt)
			 + file-025.010257e8bb.txt (uploading new version of file-025.txt)
			 + file-026.010257e8bb.txt (uploading new version of file-026.txt)
			 + file-027.010257e8bb.txt (uploading new version of file-027.txt)
			 + file-028.010257e8bb.txt (uploading new version of file-028.txt)
			 + file-029.010257e8bb.txt (uploading new version of file-029.txt)
			 + file-030.010257e8bb.txt (uploading new version of file-030.txt)
			 + file-031.010257e8bb.txt (uploading new version of file-031.txt)
			 + file-032.010257e8bb.txt (uploading new version of file-032.txt)
			 + file-033.010257e8bb.txt (uploading new version of file-033.txt)
			 + file-034.010257e8bb.txt (uploading new version of file-034.txt)
			 + file-035.010257e8bb.txt (uploading new version of file-035.txt)
			 + file-036.010257e8bb.txt (uploading new version of file-036.txt)
			 + file-037.010257e8bb.txt (uploading new version of file-037.txt)
			 + file-038.010257e8bb.txt (uploading new version of file-038.txt)
			 + file-039.010257e8bb.txt (uploading new version of file-039.txt)
			 + file-040.010257e8bb.txt (uploading new version of file-040.txt)
			 + file-041.010257e8bb.txt (uploading new version of file-041.txt)
			 + file-042.010257e8bb.txt (uploading new version of file-042.txt)
			 + file-043.010257e8bb.txt (uploading new version of file-043.txt)
			 + file-044.010257e8bb.txt (uploading new version of file-044.txt)
			 + file-045.010257e8bb.txt (uploading new version of file-045.txt)
			 + file-046.010257e8bb.txt (uploading new version of file-046.txt)
			 + file-047.010257e8bb.txt (uploading new version of file-047.txt)
			 + file-048.010257e8bb.txt (uploading new version of file-048.txt)
			 + file-049.010257e8bb.txt (uploading new version of file-049.txt)
			 + file-050.010257e8bb.txt (uploading new version of file-050.txt)
			 + file-051.010257e8bb.txt (uploading new version of file-051.txt)
			 + file-052.010257e8bb.txt (uploading new version of file-052.txt)
			 + file-053.010257e8bb.txt (uploading new version of file-053.txt)
			 + file-054.010257e8bb.txt (uploading new version of file-054.txt)
			 + file-055.010257e8bb.txt (uploading new version of file-055.txt)
			 + file-056.010257e8bb.txt (uploading new version of file-056.txt)
			 + file-057.010257e8bb.txt (uploading new version of file-057.txt)
			 + file-058.010257e8bb.txt (uploading new version of file-058.txt)
			 + file-059.010257e8bb.txt (uploading new version of file-059.txt)
			 + file-060.010257e8bb.txt (uploading new version of file-060.txt)
			 + file-061.010257e8bb.txt (uploading new version of file-061.txt)
			 + file-062.010257e8bb.txt (uploading new version of file-062.txt)
			 + file-063.010257e8bb.txt (uploading new version of file-063.txt)
			 + file-064.010257e8bb.txt (uploading new version of file-064.txt)
			 + file-065.010257e8bb.txt (uploading new version of file-065.txt)
			 + file-066.010257e8bb.txt (uploading new version of file-066.txt)
			 + file-067.010257e8bb.txt (uploading new version of file-067.txt)
			 + file-068.010257e8bb.txt (uploading new version of file-068.txt)
			 + file-069.010257e8bb.txt (uploading new version of file-069.txt)
			 + file-070.010257e8bb.txt (uploading new version of file-070.txt)
			 + file-071.010257e8bb.txt (uploading new version of file-071.txt)
			 + file-072.010257e8bb.txt (uploading new version of file-072.txt)
			 + file-073.010257e8bb.txt (uploading new version of file-073.txt)
			 + file-074.010257e8bb.txt (uploading new version of file-074.txt)
			 + file-075.010257e8bb.txt (uploading new version of file-075.txt)
			 + file-076.010257e8bb.txt (uploading new version of file-076.txt)
			 + file-077.010257e8bb.txt (uploading new version of file-077.txt)
			 + file-078.010257e8bb.txt (uploading new version of file-078.txt)
			 + file-079.010257e8bb.txt (uploading new version of file-079.txt)
			 + file-080.010257e8bb.txt (uploading new version of file-080.txt)
			 + file-081.010257e8bb.txt (uploading new version of file-081.txt)
			 + file-082.010257e8bb.txt (uploading new version of file-082.txt)
			 + file-083.010257e8bb.txt (uploading new version of file-083.txt)
			 + file-084.010257e8bb.txt (uploading new version of file-084.txt)
			 + file-085.010257e8bb.txt (uploading new version of file-085.txt)
			 + file-086.010257e8bb.txt (uploading new version of file-086.txt)
			 + file-087.010257e8bb.txt (uploading new version of file-087.txt)
			 + file-088.010257e8bb.txt (uploading new version of file-088.txt)
			 + file-089.010257e8bb.txt (uploading new version of file-089.txt)
			 + file-090.010257e8bb.txt (uploading new version of file-090.txt)
			 + file-091.010257e8bb.txt (uploading new version of file-091.txt)
			 + file-092.010257e8bb.txt (uploading new version of file-092.txt)
			 + file-093.010257e8bb.txt (uploading new version of file-093.txt)
			 + file-094.010257e8bb.txt (uploading new version of file-094.txt)
			 + file-095.010257e8bb.txt (uploading new version of file-095.txt)
			 + file-096.010257e8bb.txt (uploading new version of file-096.txt)
			 + file-097.010257e8bb.txt (uploading new version of file-097.txt)
			 + file-098.010257e8bb.txt (uploading new version of file-098.txt)
			 + file-099.010257e8bb.txt (uploading new version of file-099.txt)
			 + file-100.010257e8bb.txt (uploading new version of file-100.txt)
			 + file-101.010257e8bb.txt (uploading new version of file-101.txt)
			 + file-102.010257e8bb.txt (uploading new version of file-102.txt)
			 + file-103.010257e8bb.txt (uploading new version of file-103.txt)
			 + file-104.010257e8bb.txt (uploading new version of file-104.txt)
			 + file-105.010257e8bb.txt (uploading new version of file-105.txt)
			 + file-106.010257e8bb.txt (uploading new version of file-106.txt)
			 + file-107.010257e8bb.txt (uploading new version of file-107.txt)
			 + file-108.010257e8bb.txt (uploading new version of file-108.txt)
			 + file-109.010257e8bb.txt (uploading new version of file-109.txt)"
		`);
				expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			Uploading 110 new assets...
			Uploaded 100% [110 out of 110]"
		`);
			});
		});
	});
});
