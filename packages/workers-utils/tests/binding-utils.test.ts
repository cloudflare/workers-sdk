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

	test("ignores images url_transformations", ({ expect }) => {
		const urlTransformations = { enabled: true, allowed_origins: ["*"] };

		expect(
			convertConfigToBindings({
				images: { url_transformations: urlTransformations },
			})
		).toEqual({});
		expect(
			convertConfigToBindings({
				images: {
					binding: "IMAGES",
					remote: true,
					url_transformations: urlTransformations,
				},
			})
		).toEqual({ IMAGES: { type: "images", remote: true } });
	});
});
