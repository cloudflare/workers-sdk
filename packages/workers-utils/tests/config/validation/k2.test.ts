import { describe, it, vi } from "vitest";
import { convertConfigToBindings } from "../../../src/binding-utils";
import { validateBindingRemoteSetting } from "../../../src/config/binding-local-support";
import { normalizeAndValidateConfig } from "../../../src/config/validation";
import { mapWorkerMetadataBindings } from "../../../src/map-worker-metadata-bindings";
import type { RawConfig } from "../../../src/config";

const stream = "0123456789abcdef0123456789abcdef";
const binding = { binding: "ORDERS", stream };

describe("K2 configuration", () => {
	it("normalizes and round-trips the distinct K2 binding kind", ({
		expect,
	}) => {
		const { config, diagnostics } = normalizeAndValidateConfig(
			{ k2: [binding] },
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.errors).toEqual([]);
		expect(config.k2).toEqual([binding]);
		expect(convertConfigToBindings(config).ORDERS).toEqual({
			type: "k2",
			stream,
			remote: undefined,
		});
		expect(
			mapWorkerMetadataBindings([{ name: "ORDERS", type: "k2", stream }])
		).toEqual({ k2: [{ binding: "ORDERS", stream }] });
	});

	it.for([
		{
			value: {},
			errors: [
				'"k2[0]" must have a string "binding" field.',
				'"k2[0]" must have a string "stream" field.',
			],
		},
		{
			value: { stream },
			errors: ['"k2[0]" must have a string "binding" field.'],
		},
		{
			value: { binding: 42, stream },
			errors: ['"k2[0]" must have a string "binding" field.'],
		},
		{
			value: { binding: "ORDERS" },
			errors: ['"k2[0]" must have a string "stream" field.'],
		},
		{
			value: { binding: "ORDERS", stream: null },
			errors: ['"k2[0]" must have a string "stream" field.'],
		},
		{
			value: { binding: "ORDERS", stream: 42 },
			errors: ['"k2[0]" must have a string "stream" field.'],
		},
		{
			value: { ...binding, remote: "true" },
			errors: [
				`"k2[0]" should, optionally, have a boolean "remote" field but got {"binding":"ORDERS","stream":"${stream}","remote":"true"}.`,
			],
		},
		{
			value: { ...binding, remote: false },
			errors: [
				'"k2[0]" does not support `remote: false`. K2 bindings always access remote resources; omit "remote" or set `remote: true`.',
			],
		},
		{
			value: null,
			errors: ['"k2[0]" bindings should be objects, but got null'],
		},
		{
			value: [],
			errors: ['"k2[0]" bindings should be objects, but got []'],
		},
	])(
		"rejects an invalid K2 binding: $value",
		({ value, errors }, { expect }) => {
			const { diagnostics } = normalizeAndValidateConfig(
				{ k2: [value] } as unknown as RawConfig,
				undefined,
				undefined,
				{}
			);
			expect(diagnostics.errors).toEqual(errors);
		}
	);

	it("keeps named environments from inheriting the top-level stream", ({
		expect,
	}) => {
		const { config } = normalizeAndValidateConfig(
			{ k2: [binding], env: { staging: {} } },
			undefined,
			undefined,
			{ env: "staging" }
		);
		expect(config.k2).toEqual([]);
	});

	it("rejects binding-name collisions with other resources", ({ expect }) => {
		const { diagnostics } = normalizeAndValidateConfig(
			{ k2: [binding], pipelines: [{ binding: "ORDERS", stream }] },
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.errors).toEqual([
			"ORDERS assigned to Pipeline and K2 Stream bindings.",
			"Bindings must have unique names, so that they can all be referenced in the worker.\nPlease change your bindings to have unique names.",
		]);
	});

	it.for(["stream-v2:orders", ""])(
		"preserves opaque stream IDs in config and previews: %j",
		(streamId, { expect }) => {
			const opaqueBinding = { ...binding, stream: streamId };
			const { config, diagnostics } = normalizeAndValidateConfig(
				{ k2: [opaqueBinding], previews: { k2: [opaqueBinding] } },
				undefined,
				undefined,
				{}
			);
			expect(diagnostics.errors).toEqual([]);
			expect(config.k2).toEqual([opaqueBinding]);
			expect(config.previews?.k2).toEqual([opaqueBinding]);
		}
	);

	it("requires string stream IDs in preview bindings", ({ expect }) => {
		const { diagnostics } = normalizeAndValidateConfig(
			{
				previews: { k2: [{ ...binding, stream: 42 }] },
			} as unknown as RawConfig,
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.errors).toEqual([
			'"previews.k2[0]" must have a string "stream" field.',
		]);
	});

	it("warns about real resource usage when remote is omitted", ({ expect }) => {
		const warn = vi.fn();
		validateBindingRemoteSetting("k2", undefined, warn);
		expect(warn).toHaveBeenCalledWith(
			"K2 Stream bindings always access remote resources, and so may incur usage charges even in local dev. To suppress this warning, set `remote: true` for the binding definition in your configuration file."
		);
	});

	it("rejects explicit local-only development", ({ expect }) => {
		const warn = vi.fn();
		const { diagnostics } = normalizeAndValidateConfig(
			{ k2: [{ ...binding, remote: false }] },
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.errors).toEqual([
			'"k2[0]" does not support `remote: false`. K2 bindings always access remote resources; omit "remote" or set `remote: true`.',
		]);
		expect(() => validateBindingRemoteSetting("k2", false, warn)).toThrow(
			"K2 Stream bindings do not support local development. You can set `remote: true` for the binding definition in your configuration file to access a remote version of the resource."
		);
		expect(warn).not.toHaveBeenCalled();
	});

	it("allows explicit remote development without a usage warning", ({
		expect,
	}) => {
		const warn = vi.fn();
		expect(() => validateBindingRemoteSetting("k2", true, warn)).not.toThrow();
		expect(warn).not.toHaveBeenCalled();
	});
});
