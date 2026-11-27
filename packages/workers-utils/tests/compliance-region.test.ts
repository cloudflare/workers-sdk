import { beforeEach, describe, it, vi } from "vitest";
import {
	getCloudflareApiBaseUrl,
	getCloudflareComplianceRegion,
} from "../src/environment-variables/misc-variables";

describe("getCloudflareComplianceRegion", () => {
	beforeEach(() => {
		vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", undefined);
		vi.stubEnv("CLOUDFLARE_API_BASE_URL", undefined);
		vi.stubEnv("CF_API_BASE_URL", undefined);
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", undefined);
	});

	it("defaults to public", ({ expect }) => {
		expect(getCloudflareComplianceRegion({})).toBe("public");
		expect(getCloudflareApiBaseUrl({})).toBe(
			"https://api.cloudflare.com/client/v4"
		);
	});

	it.for(["fedramp_high", "fedramp-high"])(
		"reads CLOUDFLARE_COMPLIANCE_REGION=%s as fedramp_high",
		(region, { expect }) => {
			vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", region);

			expect(getCloudflareComplianceRegion({})).toBe("fedramp_high");
			expect(getCloudflareApiBaseUrl({})).toBe(
				"https://api.fed.cloudflare.com/client/v4"
			);
		}
	);

	it("accepts fedramp-high when the config sets fedramp_high", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", "fedramp-high");

		expect(
			getCloudflareComplianceRegion({ compliance_region: "fedramp_high" })
		).toBe("fedramp_high");
	});

	it("rejects fedramp-high when the config sets public", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", "fedramp-high");

		expect(() =>
			getCloudflareComplianceRegion({ compliance_region: "public" })
		).toThrow(
			"`CLOUDFLARE_COMPLIANCE_REGION` environment variable: `fedramp-high`"
		);
	});

	it("rejects an unknown region", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", "fedramp");

		expect(() => getCloudflareComplianceRegion({})).toThrow(
			'Expected "fedramp" to be one of ["public","fedramp_high","fedramp-high"]'
		);
	});
});
