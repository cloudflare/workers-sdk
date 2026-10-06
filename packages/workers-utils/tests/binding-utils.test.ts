import { convertConfigToBindings } from "@cloudflare/workers-utils";
import { describe, test } from "vitest";

describe("convertConfigToBindings", () => {
	test("uses preview resource identifiers for local development", ({
		expect,
	}) => {
		const bindings = convertConfigToBindings(
			{
				kv_namespaces: [
					{
						binding: "KV",
						id: "production-id",
						preview_id: "preview-id",
					},
				],
			},
			{ usePreviewIds: true }
		);

		expect(bindings).toEqual({
			KV: {
				type: "kv_namespace",
				id: "preview-id",
				preview_id: "preview-id",
			},
		});
	});
});
