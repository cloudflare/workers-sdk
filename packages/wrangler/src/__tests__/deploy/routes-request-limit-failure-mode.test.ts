import { getInstalledPackageVersion } from "@cloudflare/autoconfig";
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
import { mockGetZones } from "../helpers/mock-get-zone-from-host";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import { mockUpdateWorkerSubdomain } from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWorkerSource } from "../helpers/write-worker-source";
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

describe("deploy", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	mockConsoleMethods();

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
		// Otherwise, wrangler deploy would try to provision them.
		msw.use(
			http.get("*/accounts/:accountId/r2/buckets/:bucketName", async () => {
				return HttpResponse.json(createFetchResult({}));
			}),
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

	it("keeps the request limit failure mode of a route that already exists", async ({
		expect,
	}) => {
		writeWranglerConfig({
			routes: [
				{ pattern: "example.com/some-route/*", zone_name: "example.com" },
			],
		});
		writeWorkerSource();
		mockUpdateWorkerSubdomain({ enabled: false });
		mockUploadWorkerRequest({ expectedType: "esm" });
		mockGetZones(expect, "example.com", [{ id: "example-com-id" }]);
		// The "Request limit failure mode" chosen for a route in the dashboard
		// ("Fail open (proceed)") is a property of the route itself.
		msw.use(
			http.get("*/zones/:zoneId/workers/routes", () =>
				HttpResponse.json(
					createFetchResult([
						{
							id: "example-com-route-id",
							pattern: "example.com/some-route/*",
							script: "test-name",
							fail_open: true,
						},
					])
				)
			)
		);
		// Record every route that the deploy writes, whether through the
		// script's route list or through the zone's routes.
		const writtenRoutes: Record<string, unknown>[] = [];
		const recordWrittenRoutes = async (request: Request) => {
			const body = (await request.json()) as
				| Record<string, unknown>
				| Record<string, unknown>[];
			writtenRoutes.push(...(Array.isArray(body) ? body : [body]));
			return HttpResponse.json(createFetchResult(null));
		};
		msw.use(
			http.put(
				"*/accounts/:accountId/workers/scripts/:scriptName/routes",
				async ({ request }) => recordWrittenRoutes(request)
			),
			http.post("*/zones/:zoneId/workers/routes", async ({ request }) =>
				recordWrittenRoutes(request)
			)
		);

		await runWrangler("deploy ./index");

		for (const route of writtenRoutes) {
			expect(route.fail_open).toBe(true);
		}
	});
});
