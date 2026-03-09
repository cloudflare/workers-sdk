import { seed } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, assert, beforeEach, describe, it, vi } from "vitest";
import { sendDeploymentToTelemetryDataCatalog } from "../../metrics/data-catalog";
import { getMetricsConfig } from "../../metrics/metrics-config";
import { sniffUserAgent } from "../../package-manager";
import { getInstalledPackageJson } from "../../utils/packages";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

const TEST_DATA_CATALOG_WORKER_URL =
	"http://test-data-collector.devprod.workers.dev";

const TEST_ACCOUNT_ID = "test-account-123";
const TEST_WORKER_NAME = "test-worker";
const TEST_COMPLIANCE_CONFIG: ComplianceConfig = {
	compliance_region: "public",
};

vi.mock("../../utils/packages");
vi.mock("../../package-manager", async (importOriginal) => ({
	...(await importOriginal()),
	sniffUserAgent: vi.fn(),
}));

describe("data-catalog", () => {
	runInTempDir();

	beforeEach(() => {
		vi.mocked(getInstalledPackageJson).mockReturnValue(undefined);
		vi.mocked(sniffUserAgent).mockReturnValue("npm");
		vi.stubEnv(
			"TELEMETRY_DATA_CATALOG_WORKER_URL",
			TEST_DATA_CATALOG_WORKER_URL
		);
		// Enable telemetry for tests that expect data to be sent
		vi.mocked(getMetricsConfig).mockReturnValue({
			enabled: true,
			deviceId: "mock-device",
		});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("sendDeploymentToTelemetryDataCatalog", () => {
		it("should skip execution when TELEMETRY_DATA_CATALOG_WORKER_URL is empty", async ({
			expect,
		}) => {
			vi.unstubAllEnvs();
			vi.stubEnv("TELEMETRY_DATA_CATALOG_WORKER_URL", "");

			let requestMade = false;

			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, () => {
					requestMade = true;
					return HttpResponse.json({ success: true });
				})
			);

			await sendDeploymentToTelemetryDataCatalog({
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				projectPath: ".",
				complianceConfig: TEST_COMPLIANCE_CONFIG,
			});

			expect(requestMade).toBe(false);
		});

		it("should skip execution when telemetry is disabled via sendMetrics parameter", async ({
			expect,
		}) => {
			// Mock getMetricsConfig to return disabled when sendMetrics is false
			vi.mocked(getMetricsConfig).mockReturnValue({
				enabled: false,
				deviceId: "mock-device",
			});

			let requestMade = false;

			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, () => {
					requestMade = true;
					return HttpResponse.json({ success: true });
				})
			);

			await sendDeploymentToTelemetryDataCatalog({
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				projectPath: ".",
				sendMetrics: false,
				complianceConfig: TEST_COMPLIANCE_CONFIG,
			});

			expect(requestMade).toBe(false);
			// Verify getMetricsConfig was called with the sendMetrics parameter
			expect(getMetricsConfig).toHaveBeenCalledWith({ sendMetrics: false });
		});

		it("should skip execution when telemetry is disabled globally", async ({
			expect,
		}) => {
			// Mock getMetricsConfig to return disabled (simulates global telemetry disable)
			vi.mocked(getMetricsConfig).mockReturnValue({
				enabled: false,
				deviceId: "mock-device",
			});

			let requestMade = false;

			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, () => {
					requestMade = true;
					return HttpResponse.json({ success: true });
				})
			);

			await sendDeploymentToTelemetryDataCatalog({
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				projectPath: ".",
				complianceConfig: TEST_COMPLIANCE_CONFIG,
			});

			expect(requestMade).toBe(false);
		});

		it("should send correct data structure to telemetry endpoint", async ({
			expect,
		}) => {
			let capturedBody: unknown;
			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, async ({ request }) => {
					capturedBody = await request.json();
					return HttpResponse.json({ success: true });
				})
			);

			vi.mocked(getInstalledPackageJson).mockImplementation((packageName) => {
				if (packageName === "hono") {
					return { name: "hono", version: "4.0.0" };
				}
				return undefined;
			});

			await seed({
				"package.json": JSON.stringify({
					name: "test-project",
					dependencies: {
						hono: "^4.0.0",
					},
				}),
			});

			await sendDeploymentToTelemetryDataCatalog({
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				projectPath: ".",
				complianceConfig: TEST_COMPLIANCE_CONFIG,
			});

			expect(capturedBody).toMatchObject({
				type: "deployment",
				version: "1",
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				wranglerVersion: expect.any(String),
				packageManager: "npm",
				deployedAt: expect.any(String),
				projectDependencies: {
					hono: {
						packageJsonVersion: "^4.0.0",
						installedVersion: "4.0.0",
					},
				},
			});
		});

		it("should handle project without a package.json file", async ({
			expect,
		}) => {
			let capturedBody: { projectDependencies?: unknown } = {};
			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, async ({ request }) => {
					capturedBody = (await request.json()) as typeof capturedBody;
					return HttpResponse.json({ success: true });
				})
			);

			await sendDeploymentToTelemetryDataCatalog({
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				projectPath: ".",
				complianceConfig: TEST_COMPLIANCE_CONFIG,
			});

			expect(capturedBody).toMatchObject({
				version: "1",
			});
			// projectDependencies should not be in the response (undefined values are omitted in JSON)
			expect(capturedBody).not.toHaveProperty("projectDependencies");
		});

		it("should handle malformed package.json gracefully", async ({
			expect,
		}) => {
			let capturedBody: { projectDependencies?: unknown } = {};
			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, async ({ request }) => {
					capturedBody = (await request.json()) as typeof capturedBody;
					return HttpResponse.json({ success: true });
				})
			);

			await seed({
				"package.json": "{ invalid json content",
			});

			// Should not throw and should send undefined projectDependencies
			await sendDeploymentToTelemetryDataCatalog({
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				projectPath: ".",
				complianceConfig: TEST_COMPLIANCE_CONFIG,
			});

			expect(capturedBody).toMatchObject({
				version: "1",
			});
			expect(capturedBody).not.toHaveProperty("projectDependencies");
		});

		it("should include project dependencies with versions", async ({
			expect,
		}) => {
			let capturedBody: unknown;
			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, async ({ request }) => {
					capturedBody = await request.json();
					return HttpResponse.json({ success: true });
				})
			);

			vi.mocked(getInstalledPackageJson).mockImplementation((packageName) => {
				if (packageName === "hono") {
					return { name: "hono", version: "4.0.0" };
				}
				if (packageName === "@cloudflare/workers-types") {
					return { name: "@cloudflare/workers-types", version: "4.20240000.0" };
				}
				if (packageName === "wrangler") {
					return { name: "wrangler", version: "4.0.0" };
				}
				return undefined;
			});

			await seed({
				"package.json": JSON.stringify({
					name: "test-project",
					dependencies: {
						hono: "^4.0.0",
						"@cloudflare/workers-types": "^4.20240000.0",
						wrangler: "latest",
					},
				}),
			});

			await sendDeploymentToTelemetryDataCatalog({
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				projectPath: ".",
				complianceConfig: TEST_COMPLIANCE_CONFIG,
			});

			expect(capturedBody).toMatchObject({
				projectDependencies: {
					hono: {
						packageJsonVersion: "^4.0.0",
						installedVersion: "4.0.0",
					},
					"@cloudflare/workers-types": {
						packageJsonVersion: "^4.20240000.0",
						installedVersion: "4.20240000.0",
					},
					wrangler: {
						packageJsonVersion: "latest",
						installedVersion: "4.0.0",
					},
				},
			});
		});

		it("should include installed versions from getInstalledPackageJson", async ({
			expect,
		}) => {
			let capturedBody: {
				projectDependencies?: Record<
					string,
					{ packageJsonVersion: string; installedVersion: string }
				>;
			} = {};
			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, async ({ request }) => {
					capturedBody = (await request.json()) as typeof capturedBody;
					return HttpResponse.json({ success: true });
				})
			);

			vi.mocked(getInstalledPackageJson).mockImplementation((packageName) => {
				if (packageName === "hono") {
					return { name: "hono", version: "4.1.0" };
				}
				if (packageName === "wrangler") {
					return { name: "wrangler", version: "3.50.0" };
				}
				// some-package returns undefined, so it will be filtered out
				return undefined;
			});

			await seed({
				"package.json": JSON.stringify({
					name: "test-project",
					dependencies: {
						hono: "^4.0.0",
						wrangler: "^3.0.0",
						"some-package": "1.0.0",
					},
				}),
			});

			await sendDeploymentToTelemetryDataCatalog({
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				projectPath: ".",
				complianceConfig: TEST_COMPLIANCE_CONFIG,
			});

			expect(capturedBody).toMatchObject({
				projectDependencies: {
					hono: {
						packageJsonVersion: "^4.0.0",
						installedVersion: "4.1.0",
					},
					wrangler: {
						packageJsonVersion: "^3.0.0",
						installedVersion: "3.50.0",
					},
				},
			});
			// Packages where getInstalledPackageJson returns undefined are filtered out
			expect(capturedBody.projectDependencies).not.toHaveProperty(
				"some-package"
			);
		});

		it("should silently fail on fetch errors", async ({ expect }) => {
			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, () => {
					return HttpResponse.error();
				})
			);

			// Should not throw
			await expect(
				sendDeploymentToTelemetryDataCatalog({
					accountId: TEST_ACCOUNT_ID,
					workerName: TEST_WORKER_NAME,
					projectPath: ".",
					complianceConfig: TEST_COMPLIANCE_CONFIG,
				})
			).resolves.toBeUndefined();
		});

		it("should not include devDependencies in projectDependencies", async ({
			expect,
		}) => {
			let capturedBody: { projectDependencies?: Record<string, unknown> } = {};
			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, async ({ request }) => {
					capturedBody = (await request.json()) as typeof capturedBody;
					return HttpResponse.json({ success: true });
				})
			);

			vi.mocked(getInstalledPackageJson).mockImplementation((packageName) => {
				if (packageName === "hono") {
					return { name: "hono", version: "4.0.0" };
				}
				return undefined;
			});

			await seed({
				"package.json": JSON.stringify({
					name: "test-project",
					dependencies: {
						hono: "^4.0.0",
					},
					devDependencies: {
						vitest: "^1.0.0",
						typescript: "^5.0.0",
					},
				}),
			});

			await sendDeploymentToTelemetryDataCatalog({
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				projectPath: ".",
				complianceConfig: TEST_COMPLIANCE_CONFIG,
			});

			expect(capturedBody.projectDependencies).toHaveProperty("hono");
			expect(capturedBody.projectDependencies).not.toHaveProperty("vitest");
			expect(capturedBody.projectDependencies).not.toHaveProperty("typescript");
		});

		it("should include deployment metadata fields", async ({ expect }) => {
			let capturedBody: {
				type?: string;
				accountId?: string;
				workerName?: string;
				wranglerVersion?: string;
				packageManager?: string;
				deployedAt?: string;
			} = {};
			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, async ({ request }) => {
					capturedBody = (await request.json()) as typeof capturedBody;
					return HttpResponse.json({ success: true });
				})
			);

			await sendDeploymentToTelemetryDataCatalog({
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				projectPath: ".",
				complianceConfig: TEST_COMPLIANCE_CONFIG,
			});

			expect(capturedBody.type).toBe("deployment");
			expect(capturedBody.accountId).toBe(TEST_ACCOUNT_ID);
			expect(capturedBody.workerName).toBe(TEST_WORKER_NAME);
			expect(capturedBody.wranglerVersion).toBeDefined();
			expect(typeof capturedBody.wranglerVersion).toBe("string");
			expect(capturedBody.packageManager).toBe("npm");
			assert(capturedBody.deployedAt);
			expect(capturedBody.deployedAt).toMatch(
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
			);
			expect(new Date(capturedBody.deployedAt).toISOString()).toBe(
				capturedBody.deployedAt
			);
		});

		it("should handle undefined packageManager when sniffUserAgent returns undefined", async ({
			expect,
		}) => {
			vi.mocked(sniffUserAgent).mockReturnValue(undefined);

			let capturedBody: {
				packageManager?: string;
			} = {};
			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, async ({ request }) => {
					capturedBody = (await request.json()) as typeof capturedBody;
					return HttpResponse.json({ success: true });
				})
			);

			await sendDeploymentToTelemetryDataCatalog({
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				projectPath: ".",
				complianceConfig: TEST_COMPLIANCE_CONFIG,
			});

			expect(capturedBody).not.toHaveProperty("packageManager");
		});

		it("should detect different package managers", async ({ expect }) => {
			for (const pm of ["npm", "pnpm", "yarn", "bun"] as const) {
				vi.mocked(sniffUserAgent).mockReturnValue(pm);

				let capturedBody: { packageManager?: string } = {};
				msw.use(
					http.post(TEST_DATA_CATALOG_WORKER_URL, async ({ request }) => {
						capturedBody = (await request.json()) as typeof capturedBody;
						return HttpResponse.json({ success: true });
					})
				);

				await sendDeploymentToTelemetryDataCatalog({
					accountId: TEST_ACCOUNT_ID,
					workerName: TEST_WORKER_NAME,
					projectPath: ".",
					complianceConfig: TEST_COMPLIANCE_CONFIG,
				});

				expect(capturedBody.packageManager).toBe(pm);
			}
		});

		it("should exclude private packages from projectDependencies", async ({
			expect,
		}) => {
			let capturedBody: { projectDependencies?: Record<string, unknown> } = {};
			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, async ({ request }) => {
					capturedBody = (await request.json()) as typeof capturedBody;
					return HttpResponse.json({ success: true });
				})
			);

			vi.mocked(getInstalledPackageJson).mockImplementation((packageName) => {
				if (packageName === "hono") {
					return { name: "hono", version: "4.0.0" };
				}
				if (packageName === "my-private-lib") {
					// This is a private package - should be excluded
					return { name: "my-private-lib", version: "1.0.0", private: true };
				}
				if (packageName === "another-private-pkg") {
					// Another private package - should be excluded
					return {
						name: "another-private-pkg",
						version: "2.0.0",
						private: true,
					};
				}
				return undefined;
			});

			await seed({
				"package.json": JSON.stringify({
					name: "test-project",
					dependencies: {
						hono: "^4.0.0",
						"my-private-lib": "^1.0.0",
						"another-private-pkg": "^2.0.0",
					},
				}),
			});

			await sendDeploymentToTelemetryDataCatalog({
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				projectPath: ".",
				complianceConfig: TEST_COMPLIANCE_CONFIG,
			});

			// Public package should be included
			expect(capturedBody.projectDependencies).toHaveProperty("hono");
			expect(capturedBody.projectDependencies?.hono).toEqual({
				packageJsonVersion: "^4.0.0",
				installedVersion: "4.0.0",
			});

			// Private packages should be excluded
			expect(capturedBody.projectDependencies).not.toHaveProperty(
				"my-private-lib"
			);
			expect(capturedBody.projectDependencies).not.toHaveProperty(
				"another-private-pkg"
			);
		});

		it("should exclude `workspace:` packages from projectDependencies", async ({
			expect,
		}) => {
			let capturedBody: { projectDependencies?: Record<string, unknown> } = {};
			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, async ({ request }) => {
					capturedBody = (await request.json()) as typeof capturedBody;
					return HttpResponse.json({ success: true });
				})
			);

			vi.mocked(getInstalledPackageJson).mockImplementation((packageName) => {
				if (packageName === "hono") {
					return { name: "hono", version: "4.0.0" };
				}
				if (packageName === "@myorg/shared-utils") {
					return { name: "@myorg/shared-utils", version: "1.0.0" };
				}
				if (packageName === "@myorg/internal-lib") {
					return { name: "@myorg/internal-lib", version: "2.0.0" };
				}
				return undefined;
			});

			await seed({
				"package.json": JSON.stringify({
					name: "test-project",
					dependencies: {
						hono: "^4.0.0",
						"@myorg/shared-utils": "workspace:*",
						"@myorg/internal-lib": "workspace:^1.0.0",
					},
				}),
			});

			await sendDeploymentToTelemetryDataCatalog({
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				projectPath: ".",
				complianceConfig: TEST_COMPLIANCE_CONFIG,
			});

			// Public npm package should be included
			expect(capturedBody.projectDependencies).toHaveProperty("hono");
			expect(capturedBody.projectDependencies?.hono).toEqual({
				packageJsonVersion: "^4.0.0",
				installedVersion: "4.0.0",
			});

			// Workspace packages should be excluded
			expect(capturedBody.projectDependencies).not.toHaveProperty(
				"@myorg/shared-utils"
			);
			expect(capturedBody.projectDependencies).not.toHaveProperty(
				"@myorg/internal-lib"
			);
		});

		it("should skip execution for fedramp_high compliance region when env URL is not set", async ({
			expect,
		}) => {
			// Remove the env URL stub so we test the compliance region logic
			vi.unstubAllEnvs();

			let requestMade = false;

			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, () => {
					requestMade = true;
					return HttpResponse.json({ success: true });
				})
			);

			await sendDeploymentToTelemetryDataCatalog({
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				projectPath: ".",
				complianceConfig: { compliance_region: "fedramp_high" },
			});

			expect(requestMade).toBe(false);
		});

		it("should skip execution for staging environment when env URL is not set", async ({
			expect,
		}) => {
			// Remove the env URL stub and set staging environment
			vi.unstubAllEnvs();
			vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");

			let requestMade = false;

			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, () => {
					requestMade = true;
					return HttpResponse.json({ success: true });
				})
			);

			await sendDeploymentToTelemetryDataCatalog({
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				projectPath: ".",
				complianceConfig: TEST_COMPLIANCE_CONFIG,
			});

			expect(requestMade).toBe(false);
		});

		it("should send data when env URL is explicitly set for compliance region", async ({
			expect,
		}) => {
			// Even with compliance region, if env URL is explicitly set, it should send
			vi.stubEnv(
				"TELEMETRY_DATA_CATALOG_WORKER_URL",
				TEST_DATA_CATALOG_WORKER_URL
			);

			let requestMade = false;

			msw.use(
				http.post(TEST_DATA_CATALOG_WORKER_URL, () => {
					requestMade = true;
					return HttpResponse.json({ success: true });
				})
			);

			await sendDeploymentToTelemetryDataCatalog({
				accountId: TEST_ACCOUNT_ID,
				workerName: TEST_WORKER_NAME,
				projectPath: ".",
				complianceConfig: { compliance_region: "fedramp_high" },
			});

			expect(requestMade).toBe(true);
		});
	});
});
