import { describe, it } from "vitest";
import { renderCloudflareConfig } from "../../src/cloudflare-config/render";
import { convertWranglerConfig } from "../../src/wrangler-config/convert";
import type { RawConfig } from "@cloudflare/workers-utils/config";

describe("RealtimeKit binding conversion", () => {
	it("maps realtimekit entries to bindings.realtimeKit", ({ expect }) => {
		const converted = convertWranglerConfig(
			{
				compatibility_date: "2026-09-23",
				name: "meetings",
				realtimekit: [
					{
						binding: "RTK",
						app_id: "2da1c5c6-8e8f-4119-b89e-18558e051486",
						remote: true,
					},
				],
			} satisfies RawConfig,
			"wrangler",
			[]
		);

		expect(converted.followUps).toEqual([]);
		expect(renderCloudflareConfig(converted)).toMatchInlineSnapshot(`
			"import { bindings, defineConfig } from "cf/config";

			export default defineConfig({
				worker: {
					name: "meetings",
					compatibilityDate: "2026-09-23",
					env: {
						RTK: bindings.realtimeKit({
							id: "2da1c5c6-8e8f-4119-b89e-18558e051486",
							dev: {
								remote: true,
							},
						}),
					},
				},
			});
			"
		`);
	});
});
