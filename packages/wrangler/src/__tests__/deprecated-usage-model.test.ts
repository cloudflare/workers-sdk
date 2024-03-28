import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockUploadWorkerRequest } from "./helpers/mock-upload-worker";
import { mockSubDomainRequest } from "./helpers/mock-workers-subdomain";
import { msw, mswSuccessDeploymentScriptMetadata } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWorkerSource } from "./helpers/write-worker-source";
import writeWranglerToml from "./helpers/write-wrangler-toml";

describe("deprecated-usage-model", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = mockConsoleMethods();

	// TODO: remove the fake timers and irrelevant tests after March 1st
	beforeAll(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date(2024, 2, 2));
	});

	afterAll(() => {
		jest.useRealTimers();
	});

	it("should warn user about ignored usage model if usage_model specified", async () => {
		msw.use(...mswSuccessDeploymentScriptMetadata);
		writeWranglerToml({ usage_model: "bundled" });
		writeWorkerSource();
		mockSubDomainRequest();
		mockUploadWorkerRequest();

		await runWrangler("deploy ./index");

		expect(std.warn).toMatchInlineSnapshot(`
		"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`usage_model\` defined in wrangler.toml is deprecated and no longer used. Visit our developer docs for details: https://developers.cloudflare.com/workers/wrangler/configuration/#usage-model[0m

		"
	`);
	});
	it("should not warn user about ignored usage model if usage_model not specified", async () => {
		msw.use(...mswSuccessDeploymentScriptMetadata);
		writeWranglerToml();
		writeWorkerSource();
		mockSubDomainRequest();
		mockUploadWorkerRequest();

		await runWrangler("deploy ./index");

		expect(std).toMatchInlineSnapshot(`
		Object {
		  "debug": "",
		  "err": "",
		  "info": "",
		  "out": "Total Upload: xx KiB / gzip: xx KiB
		Uploaded test-name (TIMINGS)
		Deployed test-name triggers (TIMINGS)
		  https://test-name.test-sub-domain.workers.dev
		Current Deployment ID: Galaxy-Class


		NOTE: \\"Deployment ID\\" in this output will be changed to \\"Version ID\\" in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments",
		  "warn": "",
		}
	`);
	});
});
