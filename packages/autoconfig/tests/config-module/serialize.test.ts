import { describe, expect, it } from "vitest";
import {
	serializeCloudflareConfig,
	serializeWranglerConfig,
} from "../../src/config-module/serialize";

describe("serializers", () => {
	it("emits a defineWorker module importing from wrangler/experimental-config", () => {
		const source = serializeCloudflareConfig({
			name: "my-worker",
			compatibilityDate: "2026-01-01",
			env: { KV: { type: "kv", id: "abc" } },
		});

		expect(source).toContain(
			`import { defineWorker } from "wrangler/experimental-config";`
		);
		expect(source).toContain("export default defineWorker({");
		expect(source).toContain(`name: "my-worker"`);
		expect(source).toContain(`KV: {`);
		expect(source).toContain(`type: "kv"`);
		expect(source.trim().endsWith("});")).toBe(true);
	});

	it("quotes object keys that are not valid identifiers", () => {
		const source = serializeCloudflareConfig({
			env: { "my-binding": { type: "kv" } },
		});
		expect(source).toContain(`"my-binding": {`);
	});

	it("emits a defineWranglerConfig module for tooling", () => {
		const source = serializeWranglerConfig({ assetsDirectory: "./public" });
		expect(source).toContain(
			`import { defineWranglerConfig } from "wrangler/experimental-config";`
		);
		expect(source).toContain(`assetsDirectory: "./public"`);
	});
});
