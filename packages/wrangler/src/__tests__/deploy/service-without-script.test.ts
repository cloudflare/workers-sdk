import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { clearOutputFilePath } from "../../output";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import {
	mockGetWorkerSubdomain,
	mockSubDomainRequest,
} from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWorkerSource } from "../helpers/write-worker-source";
import {
	mockDeploymentsListRequest,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
} from "./helpers";

// Regression tests for https://github.com/cloudflare/workers-sdk/issues/17066
//
// A first deploy that fails after the upload can leave a Worker service whose
// `default_environment.script` is `null`. The next deploy must not crash on it
// with "Cannot read properties of null (reading 'tag')" in preUploadApiChecks:
// `deploy` should finish the Worker, and `versions upload` should give its
// existing "deploy first" error for a Worker that does not exist yet.
describe("deploy when the Worker service has no script", () => {
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
		mockLastDeploymentRequest();
		mockDeploymentsListRequest();
		mockPatchScriptSettings();
		mockGetSettings();
		msw.use(...mswListNewDeploymentsLatestFull);
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/scripts/:scriptName/secrets",
				() => HttpResponse.json(createFetchResult([]))
			),
			// The service exists, but it has no script yet.
			http.get("*/accounts/:accountId/workers/services/:scriptName", () =>
				HttpResponse.json(
					createFetchResult({
						default_environment: {
							environment: "production",
							script: null,
						},
					})
				)
			)
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearDialogs();
		clearOutputFilePath();
	});

	it("deploys instead of crashing on the missing script", async ({
		expect,
	}) => {
		writeWorkerSource();
		writeWranglerConfig({ workers_dev: true });
		// A Worker with no script is uploaded the way a first deploy is.
		mockUploadWorkerRequest({ useOldUploadApi: true });
		mockSubDomainRequest();
		mockGetWorkerSubdomain({ enabled: true });

		await expect(runWrangler("deploy ./index.js")).resolves.toBeUndefined();
		expect(std.out).toContain("Uploaded test-name");
		expect(std.err).not.toContain("Cannot read properties of null");
	});

	it("tells `versions upload` to deploy first instead of crashing", async ({
		expect,
	}) => {
		writeWorkerSource();
		writeWranglerConfig();

		await expect(runWrangler("versions upload ./index.js")).rejects.toThrow(
			"You cannot upload a new version of a Worker that does not yet exist. Please run the `deploy` command first."
		);
	});
});
