import { describe, it } from "vitest";
import { convertWranglerConfig } from "../../src/codemods/wrangler-to-cf/config-converter";
import { renderCloudflareConfig } from "../../src/codemods/wrangler-to-cf/config-renderer";
import type { RawConfig } from "@cloudflare/workers-utils";

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
