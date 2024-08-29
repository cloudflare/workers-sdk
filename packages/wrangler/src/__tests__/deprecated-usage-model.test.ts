import { vi } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockUploadWorkerRequest } from "./helpers/mock-upload-worker";
import { mockSubDomainRequest } from "./helpers/mock-workers-subdomain";
import { msw, mswSuccessDeploymentScriptMetadata } from "./helpers/msw";
import { mswListNewDeploymentsLatestFull } from "./helpers/msw/handlers/versions";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWorkerSource } from "./helpers/write-worker-source";
import { writeWranglerToml } from "./helpers/write-wrangler-toml";

describe("deprecated-usage-model", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = mockConsoleMethods();

	// TODO: remove the fake timers and irrelevant tests after March 1st
	beforeAll(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2024, 2, 2));
	});

	afterAll(() => {
		vi.useRealTimers();
	});

	it("should warn user about ignored usage model if usage_model specified", async () => {
		msw.use(
			...mswSuccessDeploymentScriptMetadata,
			...mswListNewDeploymentsLatestFull
		);
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
		msw.use(
			...mswSuccessDeploymentScriptMetadata,
			...mswListNewDeploymentsLatestFull
		);
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
