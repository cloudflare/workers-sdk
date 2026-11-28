import { describe, it } from "vitest";
import { renderCloudflareConfig } from "../../src/cloudflare-config/render";
import { convertWranglerConfig } from "../../src/wrangler-config/convert";
import type { RawConfig } from "@cloudflare/workers-utils/config";

describe("tail consumer conversion", () => {
	it("moves streaming tail consumers under `experimental`", ({ expect }) => {
		const converted = convertWranglerConfig(
			{
				compatibility_date: "2026-09-23",
				name: "tail-consumers",
				tail_consumers: [{ service: "tail" }],
				streaming_tail_consumers: [{ service: "streaming-tail" }],
			} satisfies RawConfig,
			"wrangler",
			[]
		);

		expect(renderCloudflareConfig(converted)).toMatchInlineSnapshot(`
			"import { defineConfig } from "cf/config";

			export default defineConfig({
				worker: {
					name: "tail-consumers",
					compatibilityDate: "2026-09-23",
					tailConsumers: [
						{
							worker: "tail",
						},
					],
					experimental: {
						streamingTailConsumers: [
							{
								worker: "streaming-tail",
							},
						],
					},
				},
			});
			"
		`);
	});
});
