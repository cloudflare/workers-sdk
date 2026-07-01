import { describe, it } from "vitest";
import { serializeCloudflareConfig } from "../../src/config-module/serialize";

describe("serializeCloudflareConfig", () => {
	it("emits a defineWorker module importing from the Cloudflare Vite plugin", ({
		expect,
	}) => {
		const source = serializeCloudflareConfig({
			name: "my-worker",
			compatibilityDate: "2026-01-01",
			env: { KV: { type: "kv", id: "abc" } },
		});

		expect(source).toContain(
			`import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";`
		);
		expect(source).toContain("export default defineWorker({");
		expect(source).toContain(`"name": "my-worker"`);
		expect(source).toContain(`"KV": {`);
		expect(source).toContain(`"type": "kv"`);
		expect(source.trim().endsWith("});")).toBe(true);
	});
});
