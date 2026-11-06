import * as fs from "node:fs";
import { getInstalledPackageVersion } from "@cloudflare/autoconfig";
import { OpenAPI } from "@cloudflare/containers-shared";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { clearOutputFilePath } from "../../output";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runWrangler } from "../helpers/run-wrangler";
import {
	mockDeploymentsListRequest,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
} from "./helpers";

vi.mock("command-exists");

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

vi.mock("@cloudflare/autoconfig", async (importOriginal) => ({
	...(await importOriginal()),
	runAutoConfig: vi.fn(),
	getInstalledPackageVersion: vi.fn(),
}));
vi.mock("@cloudflare/cli-shared-helpers/command");

describe("deploy --name with Durable Object-managed Containers", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		vi.stubGlobal("setTimeout", (fn: () => void) => {
			setImmediate(fn);
		});
		setIsTTY(false);
		OpenAPI.BASE = "";
		mockLastDeploymentRequest();
		mockDeploymentsListRequest();
		mockPatchScriptSettings();
		mockGetSettings();
		msw.use(...mswListNewDeploymentsLatestFull);
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/scripts/:scriptName/secrets",
				() => HttpResponse.json(createFetchResult([]))
			)
		);
		vi.mocked(getInstalledPackageVersion).mockReturnValue(undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearDialogs();
		clearOutputFilePath();
	});

	it("names the Durable Object-managed Container application after the overridden --name", async ({
		expect,
	}) => {
		writeWranglerConfig(
			{
				name: "original-worker",
				main: "index.js",
				durable_objects: {
					bindings: [{ name: "SANDBOX", class_name: "MySandbox" }],
				},
				migrations: [{ tag: "v1", new_sqlite_classes: ["MySandbox"] }],
				containers: [
					{
						class_name: "MySandbox",
						scheduling_policy: "durable_object",
						images: {
							sandbox: {
								image: `registry.cloudflare.com/some-account-id/sandbox@sha256:${"a".repeat(64)}`,
							},
						},
					},
				],
			},
			"./wrangler.json"
		);
		fs.writeFileSync(
			"index.js",
			`export class MySandbox{}; export default {};`
		);

		// Containers in the config force the legacy upload API (PUT script).
		mockUploadWorkerRequest({
			expectedScriptName: "renamed-worker",
			useOldUploadApi: true,
		});

		// The deploy fetches the script's service metadata more than once.
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/services/:scriptName",
				({ params }) =>
					HttpResponse.json(
						createFetchResult({
							default_environment: {
								script: {
									last_deployed_from: "wrangler",
									tag: `tag:${params.scriptName}`,
								},
							},
						})
					)
			)
		);

		// The image is registry-backed, so no Docker is needed; the deploy only
		// asks the API to prepare it.
		msw.use(
			http.post("*/image-preparations", () =>
				HttpResponse.json(createFetchResult({ status: "ready" }))
			)
		);

		// After upload, the Durable Object namespace of the container's class is
		// resolved from the uploaded Worker version.
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/scripts/renamed-worker/versions/Galaxy-Class",
				() =>
					HttpResponse.json(
						createFetchResult({
							id: "Galaxy-Class",
							resources: {
								bindings: [
									{
										type: "durable_object_namespace",
										name: "SANDBOX",
										class_name: "MySandbox",
										namespace_id: "namespace-id-1",
									},
								],
							},
						})
					)
			)
		);

		// The application for the namespace does not exist yet, so the deploy
		// creates it; capture the request that names the application.
		let createApplicationRequestBody: Record<string, unknown> | undefined;
		msw.use(
			http.get("*/applications/*", () =>
				HttpResponse.json(
					{
						success: false,
						errors: [{ code: 8000007, message: "Application not found" }],
					},
					{ status: 404 }
				)
			),
			http.post("*/applications", async ({ request }) => {
				createApplicationRequestBody = (await request.json()) as Record<
					string,
					unknown
				>;
				return HttpResponse.json(createFetchResult({ id: "application-id-1" }));
			})
		);

		await runWrangler("deploy --name renamed-worker");

		expect(std.out).toContain("renamed-worker");
		expect(createApplicationRequestBody).toMatchObject({
			name: "renamed-worker-mysandbox",
			scheduling_policy: "durable_object",
			durable_objects: { namespace_id: "namespace-id-1" },
		});
	});
});
