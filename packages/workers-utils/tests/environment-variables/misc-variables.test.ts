import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { getTelemetryDataCatalogWorkerURL } from "../../src/environment-variables/misc-variables";

describe("getTelemetryDataCatalogWorkerURL", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("should return the env URL if TELEMETRY_DATA_CATALOG_WORKER_URL is set", ({
		expect,
	}) => {
		vi.stubEnv(
			"TELEMETRY_DATA_CATALOG_WORKER_URL",
			"http://custom-telemetry.example.com"
		);

		const url = getTelemetryDataCatalogWorkerURL({
			compliance_region: "public",
		});

		expect(url).toBe("http://custom-telemetry.example.com");
	});

	it("should return empty string if TELEMETRY_DATA_CATALOG_WORKER_URL is set to empty string", ({
		expect,
	}) => {
		vi.stubEnv("TELEMETRY_DATA_CATALOG_WORKER_URL", "");

		const url = getTelemetryDataCatalogWorkerURL({
			compliance_region: "public",
		});

		expect(url).toBe("");
	});

	it("should return undefined for fedramp_high compliance region when env URL is not set", ({
		expect,
	}) => {
		const url = getTelemetryDataCatalogWorkerURL({
			compliance_region: "fedramp_high",
		});

		expect(url).toBeUndefined();
	});

	it("should return undefined for fedramp_high compliance region from env when env URL is not set", ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", "fedramp_high");

		const url = getTelemetryDataCatalogWorkerURL({});

		expect(url).toBeUndefined();
	});

	it("should return undefined for staging environment when env URL is not set", ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");

		const url = getTelemetryDataCatalogWorkerURL({
			compliance_region: "public",
		});

		expect(url).toBeUndefined();
	});

	it("should honor env URL even for compliance regions", ({ expect }) => {
		vi.stubEnv(
			"TELEMETRY_DATA_CATALOG_WORKER_URL",
			"http://custom-telemetry.example.com"
		);

		const url = getTelemetryDataCatalogWorkerURL({
			compliance_region: "fedramp_high",
		});

		// When the env URL is explicitly set, it takes precedence
		expect(url).toBe("http://custom-telemetry.example.com");
	});

	it("should honor env URL even for staging environment", ({ expect }) => {
		vi.stubEnv(
			"TELEMETRY_DATA_CATALOG_WORKER_URL",
			"http://custom-telemetry.example.com"
		);
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");

		const url = getTelemetryDataCatalogWorkerURL({
			compliance_region: "public",
		});

		// When the env URL is explicitly set, it takes precedence
		expect(url).toBe("http://custom-telemetry.example.com");
	});

	// Note: We cannot easily test the "typeof vitest !== 'undefined'" branch
	// from within vitest itself, since vitest is always defined in this context.
	// The production URL return case is effectively tested by the fact that
	// we're running in vitest, so the function returns undefined instead of
	// the production URL. This behavior is tested implicitly in other test suites
	// that mock the TELEMETRY_DATA_CATALOG_WORKER_URL to avoid skipping the function.
});
