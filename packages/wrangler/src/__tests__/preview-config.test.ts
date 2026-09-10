import { describe, test } from "vitest";
import {
	convertBindings,
	convertPreviewBaseToPreviewsConfig,
	convertProductionToPreviewsConfig,
} from "../preview/preview-config";
import type { Config } from "@cloudflare/workers-utils";

describe("Preview configuration conversion", () => {
	test("copies Preview Base placement values", ({ expect }) => {
		expect(
			convertPreviewBaseToPreviewsConfig({
				placement: { mode: "targeted", region: "WEU" },
			}).config.placement
		).toEqual({ mode: "targeted", region: "WEU" });
	});

	test("replaces production placement values with placeholders", ({ expect }) => {
		const config = {
			placement: { mode: "smart", hint: "wnam" },
		} as Config;

		expect(convertProductionToPreviewsConfig(config).config.placement).toEqual({
			mode: "smart",
			hint: "<REPLACE_ME>",
		});
	});

	test("preserves placement off without adding a placeholder", ({ expect }) => {
		const config = { placement: { mode: "off" } } as Config;

		expect(convertProductionToPreviewsConfig(config).config.placement).toEqual({
			mode: "off",
		});
	});

	test("merges map, flat array, and nested array bindings", ({ expect }) => {
		expect(
			convertBindings(
				{
					FIRST_VAR: { type: "plain_text", text: "one" },
					SECOND_VAR: { type: "plain_text", text: "two" },
					FIRST_KV: { type: "kv_namespace", namespace_id: "first" },
					SECOND_KV: { type: "kv_namespace", namespace_id: "second" },
					FIRST_DO: { type: "durable_object_namespace", class_name: "First" },
					SECOND_DO: {
						type: "durable_object_namespace",
						class_name: "Second",
					},
					FIRST_QUEUE: { type: "queue", queue_name: "first" },
					SECOND_QUEUE: { type: "queue", queue_name: "second" },
				},
				false
			).config
		).toMatchObject({
			vars: { FIRST_VAR: "one", SECOND_VAR: "two" },
			kv_namespaces: [
				{ binding: "FIRST_KV", id: "first" },
				{ binding: "SECOND_KV", id: "second" },
			],
			durable_objects: {
				bindings: [
					{ name: "FIRST_DO", class_name: "First" },
					{ name: "SECOND_DO", class_name: "Second" },
				],
			},
			queues: {
				producers: [
					{ binding: "FIRST_QUEUE", queue: "first" },
					{ binding: "SECOND_QUEUE", queue: "second" },
				],
			},
		});
	});

	test("rejects duplicate singleton bindings", ({ expect }) => {
		expect(() =>
			convertBindings(
				{
					FIRST_BROWSER: { type: "browser" },
					SECOND_BROWSER: { type: "browser" },
				},
				false
			)
		).toThrow("Preview browser binding is defined more than once");
	});
});
