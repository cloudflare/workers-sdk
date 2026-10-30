import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_COMPAT_DATE, removeDirSync } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it, vi } from "vitest";
import * as deploy from "../../deploy";
import { runPagesToWorkersDeploy } from "../../pages/run-workers-deploy";
import { detectAgent } from "../../utils/detect-agent";
import { mockAUSRequest } from "../deploy/helpers";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockSubDomainRequest } from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import type { AssetManifest } from "../../assets";

describe("config-free delegated deployment ownership", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();
	const delegation = {
		delegate: true,
		command: "deploy",
		agentId: "test-agent",
		deployArgs: { name: "test-name" },
		assetsDirectory: "public",
	} as const;
	let workerExists: boolean;
	let manifests: AssetManifest[];

	function writeViteProject() {
		writeFileSync(
			"package.json",
			JSON.stringify({
				name: "my-vite-app",
				dependencies: { vite: "8", "@cloudflare/vite-plugin": "1" },
				scripts: { deploy: "vite build && wrangler deploy" },
			})
		);
		writeFileSync(
			"vite.config.ts",
			`import { cloudflare } from "@cloudflare/vite-plugin";
			import { defineConfig } from "vite";
			export default defineConfig({ plugins: [cloudflare()] });`
		);
		mkdirSync("public");
		writeFileSync("public/index.html", "<h1>public</h1>");
	}

	function mockUpload() {
		mockUploadWorkerRequest({
			useOldUploadApi: !workerExists,
			expectedType: "none",
			expectedCompatibilityDate: DEFAULT_COMPAT_DATE,
			expectedAssets: { jwt: "<<aus-completion-token>>", config: {} },
		});
	}

	beforeEach(async () => {
		setIsTTY(false);
		vi.mocked(detectAgent).mockReturnValue({ isAgent: true, id: "test-agent" });
		vi.stubEnv("WRANGLER_CACHE_DIR", resolve(".wrangler/cache"));
		writeViteProject();
		workerExists = false;
		manifests = [];
		await mockAUSRequest(manifests);
		mockSubDomainRequest("test-sub-domain", true, false);
		msw.use(
			http.get("*/accounts/:accountId/workers/services/:scriptName", () =>
				HttpResponse.json(
					workerExists
						? createFetchResult({
								default_environment: {
									environment: "production",
									script: {
										tag: "our-worker-tag",
										tags: null,
										last_deployed_from: "api",
									},
								},
							})
						: createFetchResult(null, false, [
								{ code: 10090, message: "Service not found" },
							])
				)
			),
			http.get(
				"*/accounts/:accountId/workers/scripts/:scriptName/deployments",
				() => HttpResponse.json(createFetchResult({ deployments: [] }))
			),
			http.get(
				"*/accounts/:accountId/workers/scripts/:scriptName/versions/:versionId",
				({ params }) =>
					HttpResponse.json(createFetchResult({ id: params.versionId }))
			)
		);
	});

	it("can deploy the same Vite project twice without rewriting its configuration", async ({
		expect,
	}) => {
		const packageJson = readFileSync("package.json", "utf8");
		const viteConfig = readFileSync("vite.config.ts", "utf8");
		mockUpload();
		await runPagesToWorkersDeploy(delegation);
		workerExists = true;
		writeFileSync("public/index.html", "<h1>updated</h1>");
		mockUpload();
		await runPagesToWorkersDeploy(delegation);

		expect(manifests).toHaveLength(2);
		expect(Object.keys(manifests[0].manifest)).toEqual(["/index.html"]);
		expect(manifests[1].manifest).not.toEqual(manifests[0].manifest);
		expect(existsSync("wrangler.jsonc")).toBe(false);
		expect(readFileSync("package.json", "utf8")).toBe(packageJson);
		expect(readFileSync("vite.config.ts", "utf8")).toBe(viteConfig);
	});

	it("can redeploy after reinstalling dependencies", async ({ expect }) => {
		vi.stubEnv("WRANGLER_CACHE_DIR", "");
		mkdirSync("node_modules");
		mockUpload();
		await runPagesToWorkersDeploy(delegation);
		workerExists = true;
		removeDirSync("node_modules");
		mkdirSync("node_modules");
		mockUpload();
		await runPagesToWorkersDeploy(delegation);
		expect(manifests).toHaveLength(2);
	});

	it("does not overwrite a replacement Worker when the recorded version is missing", async ({
		expect,
	}) => {
		mockUpload();
		await runPagesToWorkersDeploy(delegation);
		workerExists = true;
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/scripts/:scriptName/versions/:versionId",
				() =>
					HttpResponse.json(
						createFetchResult(null, false, [
							{ code: 10007, message: "Version not found" },
						]),
						{ status: 404 }
					)
			)
		);
		mockUpload();
		await expect(runPagesToWorkersDeploy(delegation)).rejects.toThrow(
			"already exists in your account"
		);
		expect(manifests).toHaveLength(1);
	});

	it("does not overwrite a Worker when version verification fails", async ({
		expect,
	}) => {
		mockUpload();
		await runPagesToWorkersDeploy(delegation);
		workerExists = true;
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/scripts/:scriptName/versions/:versionId",
				() =>
					HttpResponse.json(
						createFetchResult(null, false, [
							{ code: 10000, message: "Forbidden" },
						]),
						{ status: 403 }
					)
			)
		);
		await expect(runPagesToWorkersDeploy(delegation)).rejects.toMatchObject({
			status: 403,
		});
		expect(manifests).toHaveLength(1);
	});

	it.for(["account", "project", "name"])(
		"does not reuse ownership for a different %s",
		async (differentTarget, { expect }) => {
			mockUpload();
			await runPagesToWorkersDeploy(delegation);
			workerExists = true;
			if (differentTarget === "account") {
				vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "another-account");
			} else if (differentTarget === "project") {
				mkdirSync("another-project");
				process.chdir("another-project");
				writeViteProject();
			}

			await expect(
				runPagesToWorkersDeploy({
					...delegation,
					deployArgs: {
						name: differentTarget === "name" ? "another-worker" : "test-name",
					},
				})
			).rejects.toThrow("already exists in your account");
			expect(manifests).toHaveLength(1);
		}
	);

	it("does not establish ownership after a failed upload", async ({
		expect,
	}) => {
		mockUpload();
		msw.use(
			http.put("*/accounts/:accountId/workers/scripts/:scriptName", () =>
				HttpResponse.json(
					createFetchResult(null, false, [
						{ code: 10021, message: "Invalid upload" },
					]),
					{ status: 400 }
				)
			)
		);
		await expect(runPagesToWorkersDeploy(delegation)).rejects.toMatchObject({
			code: 10021,
		});
		workerExists = true;
		await expect(runPagesToWorkersDeploy(delegation)).rejects.toThrow(
			"already exists in your account"
		);
		expect(manifests).toHaveLength(1);
	});

	it("does not establish ownership during a dry run", async ({ expect }) => {
		const actualHandler = deploy.runDeployCommandHandler;
		const handler = vi
			.spyOn(deploy, "runDeployCommandHandler")
			.mockImplementationOnce((args, options) =>
				actualHandler({ ...args, dryRun: true }, options)
			);
		try {
			await runPagesToWorkersDeploy(delegation);
		} finally {
			handler.mockRestore();
		}
		workerExists = true;
		await expect(runPagesToWorkersDeploy(delegation)).rejects.toThrow(
			"already exists in your account"
		);
		expect(manifests).toHaveLength(0);
	});

	it("reports success even if the local ownership record cannot be written", async ({
		expect,
	}) => {
		mkdirSync(".wrangler");
		writeFileSync(".wrangler/deployments", "");
		mockUpload();
		await runPagesToWorkersDeploy(delegation);
		expect(manifests).toHaveLength(1);
		expect(std.warn).toContain(
			"Could not save the deployment's local ownership record"
		);
	});
});
