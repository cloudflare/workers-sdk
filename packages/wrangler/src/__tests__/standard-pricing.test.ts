import { rest } from "msw";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockUploadWorkerRequest } from "./helpers/mock-upload-worker";
import { mockSubDomainRequest } from "./helpers/mock-workers-subdomain";
import {
	createFetchResult,
	msw,
	mswSuccessDeploymentScriptMetadata,
} from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWorkerSource } from "./helpers/write-worker-source";
import writeWranglerToml from "./helpers/write-wrangler-toml";
function mockStandardEnabled(enabled: boolean, enterprise = false) {
	msw.use(
		rest.get("*/accounts/:accountId/workers/standard", (req, res, ctx) => {
			return res.once(
				ctx.json(
					createFetchResult(
						{
							standard: enabled,
							reason: enterprise ? "enterprise without override" : "ignore",
						},
						true
					)
				)
			);
		})
	);
}

describe("standard-pricing", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = mockConsoleMethods();

	it("should do nothing if endpoint not available", async () => {
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
		Published test-name (TIMINGS)
		  https://test-name.test-sub-domain.workers.dev
		Current Deployment ID: Galaxy-Class",
		  "warn": "",
		}
	`);
	});
	it("should notify user about new pricing if not enabled", async () => {
		msw.use(...mswSuccessDeploymentScriptMetadata);
		writeWranglerToml();
		writeWorkerSource();
		mockSubDomainRequest();
		mockUploadWorkerRequest();

		mockStandardEnabled(false);

		await runWrangler("deploy ./index");

		expect(std).toMatchInlineSnapshot(`
		Object {
		  "debug": "",
		  "err": "",
		  "info": "",
		  "out": "🚧 New Workers Standard pricing is now available. Please visit the dashboard to view details and opt-in to new pricing: https://dash.cloudflare.com/some-account-id/workers/standard/opt-in.
		Total Upload: xx KiB / gzip: xx KiB
		Uploaded test-name (TIMINGS)
		Published test-name (TIMINGS)
		  https://test-name.test-sub-domain.workers.dev
		Current Deployment ID: Galaxy-Class",
		  "warn": "",
		}
	`);
	});
	it("should warn user about limits set if not enabled", async () => {
		msw.use(...mswSuccessDeploymentScriptMetadata);
		writeWranglerToml({ limits: { cpu_ms: 20_000 } });
		writeWorkerSource();
		mockSubDomainRequest();
		mockUploadWorkerRequest();

		mockStandardEnabled(false);

		await runWrangler("deploy ./index");

		expect(std).toMatchInlineSnapshot(`
		Object {
		  "debug": "",
		  "err": "",
		  "info": "",
		  "out": "🚧 New Workers Standard pricing is now available. Please visit the dashboard to view details and opt-in to new pricing: https://dash.cloudflare.com/some-account-id/workers/standard/opt-in.
		Total Upload: xx KiB / gzip: xx KiB
		Uploaded test-name (TIMINGS)
		Published test-name (TIMINGS)
		  https://test-name.test-sub-domain.workers.dev
		Current Deployment ID: Galaxy-Class",
		  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`limits\` defined in wrangler.toml can only be applied to scripts opted into Workers Standard pricing. Agree to the new pricing details to set limits for your script.[0m

		",
		}
	`);
	});
	it("should not notify user about new pricing if enterprise", async () => {
		msw.use(...mswSuccessDeploymentScriptMetadata);
		writeWranglerToml();
		writeWorkerSource();
		mockSubDomainRequest();
		mockUploadWorkerRequest();

		mockStandardEnabled(false, true);

		await runWrangler("deploy ./index");

		expect(std).toMatchInlineSnapshot(`
		Object {
		  "debug": "",
		  "err": "",
		  "info": "",
		  "out": "Total Upload: xx KiB / gzip: xx KiB
		Uploaded test-name (TIMINGS)
		Published test-name (TIMINGS)
		  https://test-name.test-sub-domain.workers.dev
		Current Deployment ID: Galaxy-Class",
		  "warn": "",
		}
	`);
	});
	it("should warn user about new pricing if enabled and usage_model specified", async () => {
		msw.use(...mswSuccessDeploymentScriptMetadata);
		writeWranglerToml({ usage_model: "bundled" });
		writeWorkerSource();
		mockSubDomainRequest();
		mockUploadWorkerRequest();

		mockStandardEnabled(true);

		await runWrangler("deploy ./index");

		expect(std).toMatchInlineSnapshot(`
		Object {
		  "debug": "",
		  "err": "",
		  "info": "",
		  "out": "Total Upload: xx KiB / gzip: xx KiB
		Uploaded test-name (TIMINGS)
		Published test-name (TIMINGS)
		  https://test-name.test-sub-domain.workers.dev
		Current Deployment ID: Galaxy-Class",
		  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`usage_model\` defined in wrangler.toml is no longer used because you have opted into Workers Standard pricing. Please remove this setting from your wrangler.toml and use the dashboard to configure the usage model for your script.[0m

		",
		}
	`);
	});
	it("should not warn user about new pricing if enabled and usage_model not specified", async () => {
		msw.use(...mswSuccessDeploymentScriptMetadata);
		writeWranglerToml();
		writeWorkerSource();
		mockSubDomainRequest();
		mockUploadWorkerRequest();

		mockStandardEnabled(true);

		await runWrangler("deploy ./index");

		expect(std).toMatchInlineSnapshot(`
		Object {
		  "debug": "",
		  "err": "",
		  "info": "",
		  "out": "Total Upload: xx KiB / gzip: xx KiB
		Uploaded test-name (TIMINGS)
		Published test-name (TIMINGS)
		  https://test-name.test-sub-domain.workers.dev
		Current Deployment ID: Galaxy-Class",
		  "warn": "",
		}
	`);
	});
});
