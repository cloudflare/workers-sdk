/* eslint-disable workers-sdk/no-vitest-import-expect */

import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
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
	mockAssetUploadRequest,
	mockAUSRequest,
	mockDeploymentsListRequest,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
	writeAssets,
} from "./helpers";
import type { AssetManifest } from "../../assets";
import type { FormData } from "undici";

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

	describe("assets", () => {
		it("should use the directory specified in the CLI over wrangler.toml", async () => {
			const cliAssets = [
				{ filePath: "cliAsset.txt", content: "Content of file-1" },
			];
			writeAssets(cliAssets, "cli-assets");
			const configAssets = [
				{ filePath: "configAsset.txt", content: "Content of file-2" },
			];
			writeAssets(configAssets, "config-assets");
			writeWranglerConfig({
				assets: { directory: "config-assets" },
			});
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy --assets cli-assets");
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toEqual({
				manifest: {
					"/cliAsset.txt": {
						hash: "0de3dd5df907418e9730fd2bd747bd5e",
						size: 17,
					},
				},
			});
		});

		it("should use the directory specified in the CLI and allow the directory to be missing in the configuration", async () => {
			const cliAssets = [
				{ filePath: "cliAsset.txt", content: "Content of file-1" },
			];
			writeAssets(cliAssets, "cli-assets");
			writeWranglerConfig({
				assets: {},
			});
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy --assets cli-assets");
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toEqual({
				manifest: {
					"/cliAsset.txt": {
						hash: "0de3dd5df907418e9730fd2bd747bd5e",
						size: 17,
					},
				},
			});
		});

		it("should error if config.site and config.assets are used together", async () => {
			writeWranglerConfig({
				main: "./index.js",
				assets: { directory: "abd" },
				site: {
					bucket: "xyz",
				},
			});
			writeWorkerSource();
			await expect(
				runWrangler("deploy")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				dedent`[Error: Cannot use assets and Workers Sites in the same Worker.
				Please remove either the \`site\` or \`assets\` field from your configuration file.]`
			);
		});

		it("should error if --assets and config.site are used together", async () => {
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "xyz",
				},
			});
			writeWorkerSource();
			await expect(
				runWrangler("deploy --assets abc")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				dedent`[Error: Cannot use assets and Workers Sites in the same Worker.
				Please remove either the \`site\` or \`assets\` field from your configuration file.]`
			);
		});

		it("should error if directory specified by flag --assets does not exist in non-interactive mode", async () => {
			setIsTTY(false);
			await expect(runWrangler("deploy --assets abc")).rejects.toThrow(
				new RegExp(
					'^The directory specified by the "--assets" command line argument does not exist:[Ss]*'
				)
			);
		});

		it("should error if the directory path specified by the assets config is undefined", async () => {
			writeWranglerConfig({
				assets: {},
			});
			await expect(
				runWrangler("deploy")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The \`assets\` property in your configuration is missing the required \`directory\` property.]`
			);
		});

		it("should error if the directory path specified by the assets config is an empty string", async () => {
			writeWranglerConfig({
				assets: { directory: "" },
			});
			await expect(
				runWrangler("deploy")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: \`The assets directory cannot be an empty string.]`
			);
		});

		it("should error if directory specified by config assets does not exist", async () => {
			writeWranglerConfig({
				assets: { directory: "abc" },
			});
			await expect(runWrangler("deploy")).rejects.toThrow(
				new RegExp(
					'^The directory specified by the "assets.directory" field in your configuration file does not exist:[Ss]*'
				)
			);
		});

		it("should error if an ASSET binding is provided without a user Worker", async () => {
			writeWranglerConfig({
				assets: {
					directory: "xyz",
					binding: "ASSET",
				},
			});
			await expect(runWrangler("deploy")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Cannot use assets with a binding in an assets-only Worker.
				Please remove the asset binding from your configuration file, or provide a Worker script in your configuration file (\`main\`).]
			`);
		});

		it("should warn when using smart placement with Worker first", async () => {
			const assets = [
				{ filePath: ".assetsignore", content: "*.bak\nsub-dir" },
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.bak", content: "Content of file-2" },
				{ filePath: "file-3.txt", content: "Content of file-3" },
				{ filePath: "sub-dir/file-4.bak", content: "Content of file-4" },
				{ filePath: "sub-dir/file-5.txt", content: "Content of file-5" },
			];
			writeAssets(assets, "assets");
			writeWorkerSource({ format: "js" });
			writeWranglerConfig({
				main: "index.js",
				assets: {
					directory: "assets",
					run_worker_first: true,
					binding: "ASSETS",
				},
				placement: {
					mode: "smart",
				},
			});
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {
						run_worker_first: true,
					},
				},
				expectedMainModule: "index.js",
				expectedBindings: [{ name: "ASSETS", type: "assets" }],
			});

			await runWrangler("deploy");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mTurning on Smart Placement in a Worker that is using assets and run_worker_first set to true means that your entire Worker could be moved to run closer to your data source, and all requests will go to that Worker before serving assets.[0m

				  This could result in poor performance as round trip times could increase when serving assets.

				  Read more: [4mhttps://developers.cloudflare.com/workers/static-assets/binding/#smart-placement[0m

				"
			`);
		});

		it("should warn if run_worker_first=true but no binding is provided", async () => {
			const assets = [
				{ filePath: ".assetsignore", content: "*.bak\nsub-dir" },
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.bak", content: "Content of file-2" },
				{ filePath: "file-3.txt", content: "Content of file-3" },
				{ filePath: "sub-dir/file-4.bak", content: "Content of file-4" },
				{ filePath: "sub-dir/file-5.txt", content: "Content of file-5" },
			];
			writeAssets(assets, "assets");
			writeWorkerSource({ format: "js" });
			writeWranglerConfig({
				main: "index.js",
				assets: {
					directory: "assets",
					run_worker_first: true,
				},
			});
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {
						run_worker_first: true,
					},
				},
				expectedMainModule: "index.js",
			});

			await runWrangler("deploy");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mrun_worker_first=true set without an assets binding[0m

				  Setting run_worker_first to true will always invoke your Worker script.
				  To fetch your assets from your Worker, please set the [assets.binding] key in your configuration
				  file.

				  Read more: [4mhttps://developers.cloudflare.com/workers/static-assets/binding/#binding[0m

				"
			`);
		});

		it("should error if run_worker_first is true and no user Worker is provided", async () => {
			const assets = [
				{ filePath: ".assetsignore", content: "*.bak\nsub-dir" },
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.bak", content: "Content of file-2" },
				{ filePath: "file-3.txt", content: "Content of file-3" },
				{ filePath: "sub-dir/file-4.bak", content: "Content of file-4" },
				{ filePath: "sub-dir/file-5.txt", content: "Content of file-5" },
			];
			writeAssets(assets, "assets");
			writeWranglerConfig({
				assets: {
					directory: "assets",
					run_worker_first: true,
				},
			});

			await expect(runWrangler("deploy")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Cannot set run_worker_first without a Worker script.
				Please remove run_worker_first from your configuration file, or provide a Worker script in your configuration file (\`main\`).]
			`);
		});

		it("should attach an 'application/null' content-type header when uploading files with an unknown extension", async () => {
			const assets = [{ filePath: "foobar.greg", content: "something-binary" }];
			writeAssets(assets);
			writeWranglerConfig({
				assets: { directory: "assets" },
			});

			const manifestBodies: AssetManifest[] = [];
			const mockBuckets = [["80e40c1f2422528cb2fba3f9389ce315"]];
			await mockAUSRequest(manifestBodies, mockBuckets, "<<aus-token>>");
			const uploadBodies: FormData[] = [];
			const uploadAuthHeaders: (string | null)[] = [];
			const uploadContentTypeHeaders: (string | null)[] = [];
			await mockAssetUploadRequest(
				mockBuckets.length,
				uploadBodies,
				uploadAuthHeaders,
				uploadContentTypeHeaders
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy");
			expect(manifestBodies.length).toBe(1);
			expect(manifestBodies[0]).toEqual({
				manifest: {
					"/foobar.greg": {
						hash: "80e40c1f2422528cb2fba3f9389ce315",
						size: 16,
					},
				},
			});
			const flatBodies = Object.fromEntries(
				uploadBodies.flatMap((b) => [...b.entries()])
			);
			await expect(
				flatBodies["80e40c1f2422528cb2fba3f9389ce315"]
			).toBeAFileWhichMatches({
				fileBits: ["c29tZXRoaW5nLWJpbmFyeQ=="],
				name: "80e40c1f2422528cb2fba3f9389ce315",
				type: "application/null",
			});
		});

		it("should be able to upload files with special characters in filepaths", async () => {
			// NB windows will disallow these characters in file paths anyway < > : " / \ | ? *
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file#1.txt", content: "Content of file-2" },
				{ filePath: "béëp/boo^p.txt", content: "Content of file-3" },
			];
			writeAssets(assets);
			writeWranglerConfig({
				assets: { directory: "assets" },
			});

			const manifestBodies: AssetManifest[] = [];
			const mockBuckets = [
				[
					"ff5016e92f039aa743a4ff7abb3180fa",
					"7574a8cd3094a050388ac9663af1c1d6",
					"0de3dd5df907418e9730fd2bd747bd5e",
				],
			];
			await mockAUSRequest(manifestBodies, mockBuckets, "<<aus-token>>");
			const uploadBodies: FormData[] = [];
			const uploadAuthHeaders: (string | null)[] = [];
			const uploadContentTypeHeaders: (string | null)[] = [];
			await mockAssetUploadRequest(
				mockBuckets.length,
				uploadBodies,
				uploadContentTypeHeaders,
				uploadAuthHeaders
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy");
			expect(manifestBodies.length).toBe(1);
			expect(manifestBodies[0]).toEqual({
				manifest: {
					"/béëp/boo^p.txt": {
						hash: "ff5016e92f039aa743a4ff7abb3180fa",
						size: 17,
					},
					"/boop/file#1.txt": {
						hash: "7574a8cd3094a050388ac9663af1c1d6",
						size: 17,
					},
					"/file-1.txt": {
						hash: "0de3dd5df907418e9730fd2bd747bd5e",
						size: 17,
					},
				},
			});
			const flatBodies = Object.fromEntries(
				uploadBodies.flatMap((b) => [...b.entries()])
			);
			await expect(
				flatBodies["ff5016e92f039aa743a4ff7abb3180fa"]
			).toBeAFileWhichMatches({
				fileBits: ["Q29udGVudCBvZiBmaWxlLTM="],
				name: "ff5016e92f039aa743a4ff7abb3180fa",
				type: "text/plain",
			});
			await expect(
				flatBodies["7574a8cd3094a050388ac9663af1c1d6"]
			).toBeAFileWhichMatches({
				fileBits: ["Q29udGVudCBvZiBmaWxlLTI="],
				name: "7574a8cd3094a050388ac9663af1c1d6",
				type: "text/plain",
			});
			await expect(
				flatBodies["0de3dd5df907418e9730fd2bd747bd5e"]
			).toBeAFileWhichMatches({
				fileBits: ["Q29udGVudCBvZiBmaWxlLTE="],
				name: "0de3dd5df907418e9730fd2bd747bd5e",
				type: "text/plain",
			});
		});

		it("should resolve assets directory relative to wrangler.toml if using config", async () => {
			const assets = [{ filePath: "file-1.txt", content: "Content of file-1" }];
			writeAssets(assets, "some/path/assets");
			writeWranglerConfig(
				{
					assets: { directory: "assets" },
				},
				"some/path/wrangler.toml"
			);
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy --config some/path/wrangler.toml");
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toEqual({
				manifest: {
					"/file-1.txt": {
						hash: "0de3dd5df907418e9730fd2bd747bd5e",
						size: 17,
					},
				},
			});
		});

		it("should ignore assets that match patterns in an .assetsignore file in the root of the assets directory", async () => {
			const redirectsContent = "/foo /bar";
			const headersContent = "/some-path\nX-Header: Custom-Value";
			const assets = [
				{ filePath: ".assetsignore", content: "*.bak\nsub-dir" },
				{ filePath: "_redirects", content: redirectsContent },
				{ filePath: "_headers", content: headersContent },
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.bak", content: "Content of file-2" },
				{ filePath: "file-3.txt", content: "Content of file-3" },
				{ filePath: "sub-dir/file-4.bak", content: "Content of file-4" },
				{ filePath: "sub-dir/file-5.txt", content: "Content of file-5" },
			];
			writeAssets(assets, "some/path/assets");
			writeWranglerConfig(
				{
					assets: { directory: "assets" },
				},
				"some/path/wrangler.toml"
			);
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {
						_headers: headersContent,
						_redirects: redirectsContent,
					},
				},
				expectedType: "none",
			});
			await runWrangler("deploy --config some/path/wrangler.toml");
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toMatchInlineSnapshot(`
				{
				  "manifest": {
				    "/file-1.txt": {
				      "hash": "0de3dd5df907418e9730fd2bd747bd5e",
				      "size": 17,
				    },
				    "/file-3.txt": {
				      "hash": "ff5016e92f039aa743a4ff7abb3180fa",
				      "size": 17,
				    },
				  },
				}
			`);
		});

		it("should error if it is going to upload a _worker.js file as an asset", async () => {
			const assets = [
				{ filePath: "_worker.js", content: "// some secret server-side code." },
			];
			writeAssets(assets, "some/path/assets");
			writeWranglerConfig(
				{
					assets: { directory: "assets" },
				},
				"some/path/wrangler.toml"
			);
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await expect(runWrangler("deploy --config some/path/wrangler.toml"))
				.rejects.toThrowErrorMatchingInlineSnapshot(`
				[Error: Uploading a Pages _worker.js file as an asset.
				This could expose your private server-side code to the public Internet. Is this intended?
				If you do not want to upload this file, either remove it or add an ".assetsignore" file, to the root of your asset directory, containing "_worker.js" to avoid uploading.
				If you do want to upload this file, you can add an empty ".assetsignore" file, to the root of your asset directory, to hide this error.]
			`);
		});

		it("should error if it is going to upload a _worker.js directory as an asset", async () => {
			const assets = [
				{
					filePath: "_worker.js/index.js",
					content: "// some secret server-side code.",
				},
				{
					filePath: "_worker.js/dep.js",
					content: "// some secret server-side code.",
				},
			];
			writeAssets(assets, "some/path/assets");
			writeWranglerConfig(
				{
					assets: { directory: "assets" },
				},
				"some/path/wrangler.toml"
			);
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await expect(runWrangler("deploy --config some/path/wrangler.toml"))
				.rejects.toThrowErrorMatchingInlineSnapshot(`
				[Error: Uploading a Pages _worker.js directory as an asset.
				This could expose your private server-side code to the public Internet. Is this intended?
				If you do not want to upload this directory, either remove it or add an ".assetsignore" file, to the root of your asset directory, containing "_worker.js" to avoid uploading.
				If you do want to upload this directory, you can add an empty ".assetsignore" file, to the root of your asset directory, to hide this error.]
			`);
		});

		it("should not error if it is going to upload a _worker.js file as an asset and there is an .assetsignore file", async () => {
			const assets = [
				{ filePath: ".assetsignore", content: "" },
				{ filePath: "_worker.js", content: "// some secret server-side code." },
			];
			writeAssets(assets, "some/path/assets");
			writeWranglerConfig(
				{
					assets: { directory: "assets" },
				},
				"some/path/wrangler.toml"
			);
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy --config some/path/wrangler.toml");
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toMatchInlineSnapshot(`
				{
				  "manifest": {
				    "/_worker.js": {
				      "hash": "266570622a24a5fb8913d53fd3ac8562",
				      "size": 32,
				    },
				  },
				}
			`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not error if it is going to upload a _worker.js file that is not at the root of the asset directory", async () => {
			const assets = [
				{
					filePath: "foo/_worker.js",
					content: "// some secret server-side code.",
				},
			];
			writeAssets(assets, "some/path/assets");
			writeWranglerConfig(
				{
					assets: { directory: "assets" },
				},
				"some/path/wrangler.toml"
			);
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy --config some/path/wrangler.toml");
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toMatchInlineSnapshot(`
				{
				  "manifest": {
				    "/foo/_worker.js": {
				      "hash": "266570622a24a5fb8913d53fd3ac8562",
				      "size": 32,
				    },
				  },
				}
			`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should upload _redirects and _headers", async () => {
			const redirectsContent = "/foo /bar";
			const headersContent = "/some-path\nX-Header: Custom-Value";
			const assets = [
				{ filePath: "_redirects", content: redirectsContent },
				{ filePath: "_headers", content: headersContent },
				{ filePath: "index.html", content: "<html></html>" },
			];
			writeAssets(assets);
			writeWranglerConfig({
				assets: { directory: "assets" },
			});
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {
						_redirects: redirectsContent,
						_headers: headersContent,
					},
				},
				expectedType: "none",
			});
			await runWrangler("deploy");
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toMatchInlineSnapshot(`
				{
				  "manifest": {
				    "/index.html": {
				      "hash": "4752155c2c0c0320b40bca1d83e8380a",
				      "size": 13,
				    },
				  },
				}
			`);
		});

		it("should resolve assets directory relative to cwd if using cli", async () => {
			const assets = [{ filePath: "file-1.txt", content: "Content of file-1" }];
			writeAssets(assets, "some/path/assets");
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			process.chdir("some/path");
			await runWrangler(
				"deploy --name test-name --compatibility-date 2024-07-31 --assets assets"
			);
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toEqual({
				manifest: {
					"/file-1.txt": {
						hash: "0de3dd5df907418e9730fd2bd747bd5e",
						size: 17,
					},
				},
			});
		});

		it("should upload an asset manifest of the files in the directory specified by --assets", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file-2.txt", content: "Content of file-2" },
			];
			writeAssets(assets);
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			// skips asset uploading since empty buckets returned
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler(
				"deploy --name test-name --compatibility-date 2024-07-31 --assets assets"
			);
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toStrictEqual({
				manifest: {
					"/file-1.txt": {
						hash: "0de3dd5df907418e9730fd2bd747bd5e",
						size: 17,
					},
					"/boop/file-2.txt": {
						hash: "7574a8cd3094a050388ac9663af1c1d6",
						size: 17,
					},
				},
			});
		});

		it("should upload an asset manifest of the files in the directory specified by [assets] config", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file-2.txt", content: "Content of file-2" },
			];
			writeAssets(assets);
			writeWranglerConfig({
				assets: { directory: "assets" },
			});
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			// skips asset uploading since empty buckets returned
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy");
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toStrictEqual({
				manifest: {
					"/file-1.txt": {
						hash: "0de3dd5df907418e9730fd2bd747bd5e",
						size: 17,
					},
					"/boop/file-2.txt": {
						hash: "7574a8cd3094a050388ac9663af1c1d6",
						size: 17,
					},
				},
			});
		});

		it("should upload assets in the requested buckets", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file-2.txt", content: "Content of file-2" },
				{ filePath: "boop/file-3.txt", content: "Content of file-3" },
				{ filePath: "file-4.txt", content: "Content of file-4" },
				{ filePath: "beep/file-5.txt", content: "Content of file-5" },
				{
					filePath: "beep/boop/beep/boop/file-6.txt",
					content: "Content of file-6",
				},
			];
			writeAssets(assets);
			writeWranglerConfig({
				assets: { directory: "assets" },
			});
			const mockBuckets = [
				[
					"0de3dd5df907418e9730fd2bd747bd5e",
					"7574a8cd3094a050388ac9663af1c1d6",
				],
				["ff5016e92f039aa743a4ff7abb3180fa"],
				["f05e28a3d0bdb90d3cf4bdafe592488f"],
				["0de3dd5df907418e9730fd2bd747bd5e"],
			];
			await mockAUSRequest([], mockBuckets, "<<aus-token>>");
			const bodies: FormData[] = [];
			const uploadAuthHeaders: (string | null)[] = [];
			const uploadContentTypeHeaders: (string | null)[] = [];
			await mockAssetUploadRequest(
				mockBuckets.length,
				bodies,
				uploadContentTypeHeaders,
				uploadAuthHeaders
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy");
			expect(uploadAuthHeaders).toStrictEqual([
				"Bearer <<aus-token>>",
				"Bearer <<aus-token>>",
				"Bearer <<aus-token>>",
				"Bearer <<aus-token>>",
			]);
			for (const uploadContentTypeHeader of uploadContentTypeHeaders) {
				expect(uploadContentTypeHeader).toMatch(/multipart\/form-data/);
			}

			expect(
				bodies
					.map((b) => [...b.entries()])
					.map((entry) => entry.length)
					.sort()
			).toEqual([1, 1, 1, 2]);

			const flatBodies = Object.fromEntries(
				bodies.flatMap((b) => [...b.entries()])
			);

			await expect(
				flatBodies["0de3dd5df907418e9730fd2bd747bd5e"]
			).toBeAFileWhichMatches({
				fileBits: ["Q29udGVudCBvZiBmaWxlLTE="],
				name: "0de3dd5df907418e9730fd2bd747bd5e",
				type: "text/plain",
			});
			await expect(
				flatBodies["7574a8cd3094a050388ac9663af1c1d6"]
			).toBeAFileWhichMatches({
				fileBits: ["Q29udGVudCBvZiBmaWxlLTI="],
				name: "7574a8cd3094a050388ac9663af1c1d6",
				type: "text/plain",
			});
			await expect(
				flatBodies["ff5016e92f039aa743a4ff7abb3180fa"]
			).toBeAFileWhichMatches({
				fileBits: ["Q29udGVudCBvZiBmaWxlLTM="],
				name: "ff5016e92f039aa743a4ff7abb3180fa",
				type: "text/plain",
			});
			await expect(
				flatBodies["f05e28a3d0bdb90d3cf4bdafe592488f"]
			).toBeAFileWhichMatches({
				fileBits: ["Q29udGVudCBvZiBmaWxlLTU="],
				name: "f05e28a3d0bdb90d3cf4bdafe592488f",
				type: "text/plain",
			});
		});

		it("should be able to upload a user worker with ASSETS binding and config", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file-2.txt", content: "Content of file-2" },
			];
			writeAssets(assets);
			writeWorkerSource({ format: "js" });
			writeWranglerConfig({
				main: "index.js",
				compatibility_date: "2024-09-27",
				compatibility_flags: ["nodejs_compat"],
				assets: {
					directory: "assets",
					binding: "ASSETS",
					html_handling: "none",
					not_found_handling: "404-page",
				},
			});
			await mockAUSRequest();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: { html_handling: "none", not_found_handling: "404-page" },
				},
				expectedBindings: [{ name: "ASSETS", type: "assets" }],
				expectedMainModule: "index.js",
				expectedCompatibilityDate: "2024-09-27",
				expectedCompatibilityFlags: ["nodejs_compat"],
			});
			await runWrangler("deploy");
		});

		it("run_worker_first correctly overrides default if set to true", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file-2.txt", content: "Content of file-2" },
			];
			writeAssets(assets);
			writeWorkerSource({ format: "js" });
			writeWranglerConfig({
				main: "index.js",
				compatibility_date: "2024-09-27",
				compatibility_flags: ["nodejs_compat"],
				assets: {
					directory: "assets",
					binding: "ASSETS",
					html_handling: "none",
					not_found_handling: "404-page",
					run_worker_first: true,
				},
			});
			await mockAUSRequest();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {
						html_handling: "none",
						not_found_handling: "404-page",
						run_worker_first: true,
					},
				},
				expectedBindings: [{ name: "ASSETS", type: "assets" }],
				expectedMainModule: "index.js",
				expectedCompatibilityDate: "2024-09-27",
				expectedCompatibilityFlags: ["nodejs_compat"],
			});
			await runWrangler("deploy");
		});

		it("uploads run_worker_first=true when provided in config", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file-2.txt", content: "Content of file-2" },
			];
			writeAssets(assets);
			writeWorkerSource({ format: "js" });
			writeWranglerConfig({
				main: "index.js",
				compatibility_date: "2024-09-27",
				compatibility_flags: ["nodejs_compat"],
				assets: {
					directory: "assets",
					binding: "ASSETS",
					html_handling: "none",
					not_found_handling: "404-page",
					run_worker_first: true,
				},
			});
			await mockAUSRequest();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {
						html_handling: "none",
						not_found_handling: "404-page",
						run_worker_first: true,
					},
				},
				expectedBindings: [{ name: "ASSETS", type: "assets" }],
				expectedMainModule: "index.js",
				expectedCompatibilityDate: "2024-09-27",
				expectedCompatibilityFlags: ["nodejs_compat"],
			});
			await runWrangler("deploy");
		});

		it("uploads run_worker_first=[rules] when provided in config", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file-2.txt", content: "Content of file-2" },
			];
			writeAssets(assets);
			writeWorkerSource({ format: "js" });
			writeWranglerConfig({
				main: "index.js",
				compatibility_date: "2024-09-27",
				compatibility_flags: ["nodejs_compat"],
				assets: {
					directory: "assets",
					binding: "ASSETS",
					html_handling: "none",
					not_found_handling: "404-page",
					run_worker_first: ["/api", "!/api/asset"],
				},
			});
			await mockAUSRequest();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {
						html_handling: "none",
						not_found_handling: "404-page",
						run_worker_first: ["/api", "!/api/asset"],
					},
				},
				expectedBindings: [{ name: "ASSETS", type: "assets" }],
				expectedMainModule: "index.js",
				expectedCompatibilityDate: "2024-09-27",
				expectedCompatibilityFlags: ["nodejs_compat"],
			});
			await runWrangler("deploy");
		});

		it("run_worker_first omitted when not provided in config", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file-2.txt", content: "Content of file-2" },
			];
			writeAssets(assets);
			writeWorkerSource({ format: "js" });
			writeWranglerConfig({
				main: "index.js",
				compatibility_date: "2024-09-27",
				compatibility_flags: ["nodejs_compat"],
				assets: {
					directory: "assets",
					binding: "ASSETS",
					html_handling: "none",
					not_found_handling: "404-page",
				},
			});
			await mockAUSRequest();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {
						html_handling: "none",
						not_found_handling: "404-page",
					},
				},
				expectedBindings: [{ name: "ASSETS", type: "assets" }],
				expectedMainModule: "index.js",
				expectedCompatibilityDate: "2024-09-27",
				expectedCompatibilityFlags: ["nodejs_compat"],
			});
			await runWrangler("deploy");
		});

		it("should be able to upload an asset-only project", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file-2.txt", content: "Content of file-2" },
			];
			writeAssets(assets);
			writeWorkerSource({ format: "js" });
			writeWranglerConfig({
				compatibility_date: "2024-09-27",
				compatibility_flags: ["nodejs_compat"],
				assets: {
					directory: "assets",
					html_handling: "none",
				},
			});
			await mockAUSRequest();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: { html_handling: "none" },
				},
				expectedCompatibilityDate: "2024-09-27",
				expectedCompatibilityFlags: ["nodejs_compat"],
				expectedMainModule: undefined,
			});
			await runWrangler("deploy");
		});

		it("should be able to upload to a WfP script", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file-2.txt", content: "Content of file-2" },
			];
			writeAssets(assets);
			writeWorkerSource({ format: "js" });
			writeWranglerConfig({
				compatibility_date: "2024-09-27",
				compatibility_flags: ["nodejs_compat"],
				assets: {
					directory: "assets",
					html_handling: "none",
				},
			});
			await mockAUSRequest(undefined, undefined, undefined, "my-namespace");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: { html_handling: "none" },
				},
				expectedCompatibilityDate: "2024-09-27",
				expectedCompatibilityFlags: ["nodejs_compat"],
				expectedMainModule: undefined,
				expectedDispatchNamespace: "my-namespace",
			});
			await runWrangler("deploy --dispatch-namespace my-namespace");
		});
	});
});
