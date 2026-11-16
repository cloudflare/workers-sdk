import { describe, it } from "vitest";
import { convertWranglerConfig } from "../../src/codemods/wrangler-to-cf/config-converter";
import { renderCloudflareConfig } from "../../src/codemods/wrangler-to-cf/config-renderer";
import type { RawConfig } from "@cloudflare/workers-utils";

const streamId = "0123456789abcdef0123456789abcdef";

describe("stream binding conversion", () => {
	it("maps Pipelines and K2 stream IDs", ({ expect }) => {
		const converted = convertWranglerConfig(
			{
				compatibility_date: "2026-09-23",
				name: "streams",
				pipelines: [{ binding: "EVENTS", stream: streamId }],
				k2: [{ binding: "ORDERS", stream: streamId }],
			} satisfies RawConfig,
			"wrangler",
			[]
		);

		expect(converted.followUps).toEqual([]);
		expect(renderCloudflareConfig(converted)).toMatchInlineSnapshot(`
			"import { bindings, defineConfig } from "cf/config";

			export default defineConfig({
				worker: {
					name: "streams",
					compatibilityDate: "2026-09-23",
					env: {
						ORDERS: bindings.k2({
							id: "0123456789abcdef0123456789abcdef",
						}),
						EVENTS: bindings.pipeline({
							streamId: "0123456789abcdef0123456789abcdef",
						}),
					},
				},
			});
			"
		`);
	});

	it("reports a binding that uses the deprecated `pipeline` field", ({
		expect,
	}) => {
		const converted = convertWranglerConfig(
			{
				compatibility_date: "2026-09-23",
				name: "legacy-pipeline",
				pipelines: [{ binding: "EVENTS", pipeline: "my-pipeline" }],
			} satisfies RawConfig,
			"wrangler",
			[]
		);

		expect(converted.followUps.map(({ code }) => code)).toEqual([
			"legacy-pipeline-binding",
		]);
		expect(renderCloudflareConfig(converted)).toMatchInlineSnapshot(`
			"import { bindings, defineConfig } from "cf/config";

			/**
			 * This migration needs manual work. Resolve every TODO in this file, then remove the error below.
			 */
			/**
			 * TODO(@cloudflare): cf migrate: pipelines.0: The Pipelines binding at \`pipelines.0\` used the deprecated \`pipeline\` field, which names a legacy pipeline. Set \`streamId\` to the ID of the stream to write to.
			 */
			throw new Error("Migration incomplete. Resolve every cf migrate TODO in \`cloudflare.config.ts\`.");

			export default defineConfig({
				worker: {
					name: "legacy-pipeline",
					compatibilityDate: "2026-09-23",
					env: {
						EVENTS: bindings.pipeline({
							/**
							 * TODO(@cloudflare): cf migrate: The Pipelines binding at \`pipelines.0\` used the deprecated \`pipeline\` field, which names a legacy pipeline. Set \`streamId\` to the ID of the stream to write to.
							 */
							streamId: "STREAM_ID",
						}),
					},
				},
			});
			"
		`);
	});
});
