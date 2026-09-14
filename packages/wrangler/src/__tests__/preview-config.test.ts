import { describe, test } from "vitest";
import {
	convertBindings,
	convertPreviewBaseToPreviewsConfig,
	convertProductionToPreviewsConfig,
	convertTopLevelSettings,
} from "../preview/preview-config";
import type { Binding } from "@cloudflare/deploy-helpers";
import type { Config } from "@cloudflare/workers-utils";

describe("Preview configuration conversion", () => {
	test("copies Preview Base placement values", ({ expect }) => {
		expect(
			convertPreviewBaseToPreviewsConfig({
				placement: {
					mode: "targeted",
					region: "WEU",
					hint: undefined,
				},
			} as Parameters<typeof convertPreviewBaseToPreviewsConfig>[0]).config
				.placement
		).toEqual({ mode: "targeted", region: "WEU" });
	});

	test("preserves smart placement without adding a hint", ({ expect }) => {
		const config = { placement: { mode: "smart" } } as Config;

		expect(convertProductionToPreviewsConfig(config).config.placement).toEqual({
			mode: "smart",
		});
	});

	test("replaces production placement values with placeholders", ({
		expect,
	}) => {
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

	test("preserves explicit empty top-level values", ({ expect }) => {
		expect(
			convertTopLevelSettings(
				{ define: {}, logpush: false, tail_consumers: [] },
				false
			)
		).toEqual({ define: {}, logpush: false, tail_consumers: [] });
	});

	test("keeps staged AI bindings remote-only", ({ expect }) => {
		expect(
			convertBindings({ AI: { type: "ai", staging: true } }, false)
		).toEqual({
			config: {},
			omittedBindings: [{ name: "AI", type: "ai" }],
		});
		expect(
			convertProductionToPreviewsConfig({
				ai: { binding: "AI", staging: true },
			} as Config)
		).toEqual({
			config: {},
			omittedBindings: [{ name: "AI", type: "ai" }],
		});
	});

	test("does not read or serialize unsupported binding payloads", ({
		expect,
	}) => {
		const secretBinding = Object.defineProperty(
			{ type: "secret_text" } as Binding,
			"text",
			{
				enumerable: true,
				get() {
					throw new Error("secret text must not be read");
				},
			}
		);
		const moduleBinding = Object.defineProperty(
			{ type: "wasm_module" } as Binding,
			"source",
			{
				enumerable: true,
				get() {
					throw new Error("module source must not be read");
				},
			}
		);

		const result = convertBindings(
			{
				SECRET: secretBinding,
				MODULE: moduleBinding,
				BLOB: { type: "text_blob", text: "LEAKED_BLOB_CONTENT" },
			},
			false
		);

		expect(result).toEqual({
			config: {},
			omittedBindings: [
				{ name: "SECRET", type: "secret_text" },
				{ name: "MODULE", type: "wasm_module" },
				{ name: "BLOB", type: "text_blob" },
			],
		});
		expect(JSON.stringify(result)).not.toContain("LEAKED_BLOB_CONTENT");
	});

	test("ignores unsupported production binding families without reading payloads", ({
		expect,
	}) => {
		const wasmModules = Object.defineProperty({}, "WASM", {
			enumerable: true,
			get() {
				throw new Error("wasm contents must not be read");
			},
		});
		const textBlobs = Object.defineProperty({}, "TEXT", {
			enumerable: true,
			get() {
				throw new Error("text blob contents must not be read");
			},
		});
		const dataBlobs = Object.defineProperty({}, "DATA", {
			enumerable: true,
			get() {
				throw new Error("data blob contents must not be read");
			},
		});
		const logfwdrBinding = Object.defineProperty(
			{ name: "LOG" },
			"destination",
			{
				enumerable: true,
				get() {
					throw new Error("log destination must not be read");
				},
			}
		);
		const helloWorldBinding = Object.defineProperty(
			{ binding: "HELLO" },
			"enable_timer",
			{
				enumerable: true,
				get() {
					throw new Error("hello world options must not be read");
				},
			}
		);

		const result = convertProductionToPreviewsConfig({
			wasm_modules: wasmModules,
			text_blobs: textBlobs,
			data_blobs: dataBlobs,
			logfwdr: { bindings: [logfwdrBinding] },
			unsafe_hello_world: [helloWorldBinding],
		} as unknown as Config);

		expect(result).toEqual({
			config: {},
			omittedBindings: [],
		});
	});

	test("replaces production service environments with placeholders", ({
		expect,
	}) => {
		const result = convertProductionToPreviewsConfig({
			services: [
				{
					binding: "API",
					service: "production-service",
					environment: "production",
				},
			],
		} as Config);

		expect(result.config.services).toEqual([
			{
				binding: "API",
				service: "<REPLACE_ME>",
				environment: "<REPLACE_ME>",
			},
		]);
		expect(JSON.stringify(result)).not.toContain("production");
	});

	test("preserves production tail consumers without copying their values", ({
		expect,
	}) => {
		const result = convertProductionToPreviewsConfig({
			tail_consumers: [
				{ service: "production-tail", environment: "production" },
			],
		} as Config);

		expect(result.config.tail_consumers).toEqual([{ service: "<REPLACE_ME>" }]);
		expect(JSON.stringify(result)).not.toContain("production-tail");
		expect(JSON.stringify(result)).not.toContain("production");
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
