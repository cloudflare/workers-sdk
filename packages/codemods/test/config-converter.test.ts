import { describe, it } from "vitest";
import { convertWranglerConfig } from "../src/codemods/wrangler-to-cf/config-converter";
import {
	renderCloudflareConfig,
	renderWranglerConfig,
} from "../src/codemods/wrangler-to-cf/config-renderer";
import type { MigrationBundler } from "../src/codemods/wrangler-to-cf/types";

function convert(
	source: Record<string, unknown>,
	bundler: MigrationBundler = "vite",
	secretFiles: string[] = []
): {
	cloudflareConfig: string;
	codes: string[];
	wranglerConfig: string | null;
} {
	const converted = convertWranglerConfig(source, bundler, secretFiles);
	return {
		cloudflareConfig: renderCloudflareConfig(converted),
		codes: converted.followUps.map(({ code }) => code),
		wranglerConfig: renderWranglerConfig(converted),
	};
}

describe("Wrangler environment and tooling conversion", () => {
	it("converts environments and previews without inheriting bindings", ({
		expect,
	}) => {
		const result = convert(
			{
				compatibility_date: "2026-09-23",
				env: {
					staging: {
						compliance_region: "fedramp_high",
						previews: { vars: { MODE: "preview" } },
						vars: { MODE: "staging" },
					},
				},
				kv_namespaces: [{ binding: "CACHE", id: "production-cache" }],
				logfwdr: {
					bindings: [{ destination: "logs", name: "LOGS" }],
				},
				name: "example-worker",
				previews: { vars: { MODE: "preview" } },
			},
			"vite",
			[".env.example"]
		);

		expect(result.codes).toEqual(
			expect.arrayContaining([
				"environments-migrated",
				"preview-review",
				"secret-files-not-migrated",
			])
		);
		expect(result.cloudflareConfig.match(/CACHE: bindings\.kv/g)).toHaveLength(
			1
		);
		expect(
			result.cloudflareConfig.match(/LOGS: bindings\.logfwdr/g)
		).toHaveLength(4);
		expect(result).toMatchSnapshot();
	});

	it("reports Vite mode and tooling conflicts", ({ expect }) => {
		const result = convert({
			compatibility_date: "2026-09-23",
			dev: { port: 9000 },
			env: {
				development: { vars: { MODE: "development" } },
				production: { vars: { MODE: "production" } },
			},
			name: "example-worker",
			no_bundle: true,
			previews: { define: { PREVIEW_ONLY: '"preview"' } },
		});

		expect(result.codes).toEqual(
			expect.arrayContaining([
				"vite-mode-environment-conflict",
				"vite-tooling-config",
			])
		);
		expect(result.wranglerConfig).toBeNull();
		expect(result).toMatchSnapshot();
	});

	it("renders Wrangler tooling branches independently", ({ expect }) => {
		const result = convert(
			{
				assets: { directory: "public" },
				compatibility_date: "2026-09-23",
				define: { BASE_ONLY: '"base"' },
				env: {
					staging: {
						define: { PRODUCTION_ONLY: '"production"' },
						previews: { vars: { MODE: "preview" } },
					},
				},
				name: "example-worker",
				previews: { define: { PREVIEW_ONLY: '"preview"' } },
			},
			"wrangler"
		);

		expect(result.wranglerConfig).not.toBeNull();
		expect(result.wranglerConfig?.match(/BASE_ONLY/g)).toHaveLength(1);
		expect(result.wranglerConfig?.match(/PRODUCTION_ONLY/g)).toHaveLength(1);
		expect(result.wranglerConfig?.match(/PREVIEW_ONLY/g)).toHaveLength(1);
		expect(result).toMatchSnapshot();
	});

	it("reports unknown preview fields", ({ expect }) => {
		const result = convert({
			compatibility_date: "2026-09-23",
			env: {
				staging: {
					previews: { environment_custom_option: true },
				},
			},
			name: "example-worker",
			previews: { custom_option: true },
		});

		expect(result.cloudflareConfig).toContain("previews.custom_option");
		expect(result.cloudflareConfig).toContain(
			"env.staging.previews.environment_custom_option"
		);
	});
});
