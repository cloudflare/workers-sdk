import { describe, it } from "vitest";
import { convertWranglerConfig } from "../../src/codemods/wrangler-to-cf/config-converter";
import { renderCloudflareConfig } from "../../src/codemods/wrangler-to-cf/config-renderer";
import type { RawConfig } from "@cloudflare/workers-utils";

describe("experimental Worker settings", () => {
	it("moves `first_party_worker` under `experimental`", ({ expect }) => {
		const converted = convertWranglerConfig(
			{
				compatibility_date: "2026-09-23",
				name: "first-party",
				first_party_worker: true,
				streaming_tail_consumers: [{ service: "streaming-tail" }],
			} satisfies RawConfig,
			"wrangler",
			[]
		);

		expect(renderCloudflareConfig(converted)).toMatchInlineSnapshot(`
			"import { defineConfig } from "cf/config";

			export default defineConfig({
				worker: {
					name: "first-party",
					compatibilityDate: "2026-09-23",
					experimental: {
						streamingTailConsumers: [
							{
								worker: "streaming-tail",
							},
						],
						firstPartyWorker: true,
					},
				},
			});
			"
		`);
	});
});
